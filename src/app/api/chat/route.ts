import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamNvidiaCompletion, parseSSEStream } from '@/lib/nvidia-nim';
import { Database } from '@/types/database';
import type { AttachmentPayload } from '@/types/attachments';
import * as fs from 'fs';
import * as path from 'path';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];

// ── Quota configuration ──────────────────────────────────────────────────────
const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours
const RPM_LIMIT = 20;

/** Must match the client-side cap in useChat.ts. */
const MAX_INPUT_CHARS = 40_000;

// ── System prompt — cached at module load, never blocks a request ─────────────
// Reads the file once when the server cold-starts. Eliminates the per-request
// synchronous fs.readFileSync that previously blocked the Node.js event loop.
const SYSTEM_PROMPT_BASE: string = (() => {
    try {
        return fs.readFileSync(path.join(process.cwd(), 'system_prompt.txt'), 'utf-8');
    } catch {
        console.warn('[Chat] Could not read system_prompt.txt, using default');
        return 'You are a helpful AI assistant.';
    }
})();

// Rough token estimate: ~4 chars per token
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export async function POST(request: NextRequest) {
    try {
        // ── CSRF: verify the request originates from this application ─────────
        // Browsers always send Origin on cross-site requests; same-origin XHR/fetch
        // also sends it. We reject anything that doesn't match our host.
        const origin = request.headers.get('origin');
        const host   = request.headers.get('host');
        if (origin) {
            try {
                const originHost = new URL(origin).host;
                if (originHost !== host) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            } catch {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const supabase = await createClient();

        // ── Parse request body first so we can use modelId / sessionId
        //    in all subsequent parallel queries without waiting for auth. ────────
        const { sessionId, messageId, content, model, systemPrompt: userSystemPrompt, attachments = [] } = await request.json();
        const typedAttachments: AttachmentPayload[] = Array.isArray(attachments) ? attachments : [];

        if (!content) {
            return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
        }

        // ── Server-side input length guard (mirrors client check in useChat.ts) ─
        if (typeof content !== 'string' || content.length > MAX_INPUT_CHARS) {
            return NextResponse.json(
                { error: `Message exceeds the maximum allowed length of ${MAX_INPUT_CHARS.toLocaleString()} characters.` },
                { status: 400 }
            );
        }

        // modelId comes from the request body (model.id passed from useChat)
        const modelId: string = model || 'souvik-ai-1';
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();

        // ── Batch 1: auth + all queries that don't need user.id ──────────────────
        // auth.getUser(), admin_settings, models, and chat_messages all run
        // concurrently. Previously auth ran alone, then Round 1 ran, then Round 2
        // — that was 3 sequential round-trips. Now it's 2.
        const [authRes, settingsRes, modelRes, chatHistoryRes] = await Promise.all([
            supabase.auth.getUser(),
            supabase.from('admin_settings').select('*').single(),
            supabase.from('models').select('*').eq('id', modelId).single(),
            // chat_messages only needs sessionId + messageId (both from body)
            (sessionId && messageId)
                ? supabase.from('chat_messages').select('role, content')
                    .eq('session_id', sessionId)
                    .neq('id', messageId)
                    .order('created_at', { ascending: true })
                : Promise.resolve({ data: null }),
        ]);

        const user = authRes.data.user;
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── Model / admin-settings validation (no DB round-trip needed) ──────────
        const adminSettings = settingsRes.data as AdminSettingsRow | null;
        if (adminSettings?.edit_mode) {
            return NextResponse.json(
                { error: 'We are currently updating our services, try again later.' },
                { status: 503 }
            );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbModel: any = modelRes.data;
        if (!dbModel) {
            return NextResponse.json({ error: 'Model not found' }, { status: 404 });
        }
        if (dbModel.is_suspended) {
            return NextResponse.json(
                { error: "This model is currently suspended. We're working on it." },
                { status: 503 }
            );
        }

        const quotaLimit: number = dbModel.quota_limit ?? 500_000;

        // ── Batch 2: user-dependent queries (profile, RPM, quota) ────────────────
        // These need user.id which is now available from Batch 1.
        const [profileRes, recentRequestsRes, usageRowsRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('requests_log')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('created_at', oneMinuteAgo),
            supabase.from('token_usage')
                .select('tokens_used')
                .eq('user_id', user.id)
                .eq('model_id', modelId)
                .gte('created_at', windowStart),
        ]);

        // ── Profile validation ───────────────────────────────────────────────────
        const userProfile = profileRes.data as unknown as ProfileRow;
        if (!userProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (userProfile.is_deleted) return NextResponse.json({ error: 'Account has been deleted' }, { status: 403 });
        if (userProfile.is_kicked) return NextResponse.json({ error: 'You have been kicked out of the model quota.' }, { status: 403 });
        if (userProfile.suspended_until && new Date(userProfile.suspended_until) > new Date()) {
            return NextResponse.json(
                { error: 'Your account is suspended', until: userProfile.suspended_until, reason: userProfile.suspension_reason },
                { status: 403 }
            );
        }

        // ── Rate limit check ─────────────────────────────────────────────────────
        if ((recentRequestsRes.count ?? 0) >= RPM_LIMIT) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. You can send up to 20 messages per minute.' },
                { status: 429 }
            );
        }

        // ── Quota check ──────────────────────────────────────────────────────────
        const tokensUsed = (usageRowsRes.data ?? []).reduce(
            (sum: number, r: { tokens_used: number }) => sum + r.tokens_used,
            0
        );
        if (tokensUsed >= quotaLimit) {
            return NextResponse.json(
                { error: 'Token quota exceeded for this model. Please wait for the 5-hour window to reset.', quotaExceeded: true, used: tokensUsed, limit: quotaLimit },
                { status: 429, headers: { 'X-Quota-Used': String(tokensUsed), 'X-Quota-Limit': String(quotaLimit) } }
            );
        }

        // ── Log request (fire-and-forget) ────────────────────────────────────────
        supabase.from('requests_log').insert({
            user_id: user.id,
            status: 'completed',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).then(({ error }: any) => {
            if (error) console.error('Failed to log request:', error);
        });

        // ── Build conversation history ────────────────────────────────────────────
        let conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
        if (chatHistoryRes.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            conversationHistory = (chatHistoryRes.data as any[]).map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }));
        }

        // ── Build system prompt from module-level cache (zero I/O cost) ──────────
        let systemPrompt = SYSTEM_PROMPT_BASE;
        if (userSystemPrompt && userSystemPrompt.trim().length > 0) {
            systemPrompt += `\n\nUser Custom Instructions:\n${userSystemPrompt}`;
        }

        // ── Build user content — vision array if images present, plain string otherwise
        // Option A: images sent as base64 image_url entries (NVIDIA NIM OpenAI-compat)
        // Option B: extracted document text prepended to the text content
        const docContext = typedAttachments
            .filter((a) => a.kind === 'document' && a.extractedText)
            .map((a) => `=== Attached document: ${a.name} ===\n${a.extractedText}\n===`)
            .join('\n\n');

        const userText = docContext ? `${docContext}\n\nUser message:\n${content}` : content;

        const imageAttachments = typedAttachments.filter((a) => a.kind === 'image' && a.base64);

        // Build the content field: array (vision) or string (text-only)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userContent: any = imageAttachments.length > 0
            ? [
                { type: 'text', text: userText },
                ...imageAttachments.map((a) => ({
                    type: 'image_url',
                    image_url: { url: a.base64 },
                })),
              ]
            : userText;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiMessages: any[] = [
            { role: 'system' as const, content: systemPrompt },
            ...conversationHistory,
            { role: 'user' as const, content: userContent },
        ];

        const temperature = adminSettings?.temperature || 0.7;
        const maxTokens = adminSettings?.max_tokens || 2048;
        const modelName = dbModel.name || adminSettings?.model_name || 'meta/llama-3.1-8b-instruct';

        // ── Stream response + track tokens ───────────────────────────────────────
        const stream = await streamNvidiaCompletion(apiMessages, {
            model: modelName,
            temperature,
            maxTokens,
        });

        const textStream = parseSSEStream(stream);
        const reader = textStream.getReader();
        const encoder = new TextEncoder();

        const inputText = apiMessages.map(m => m.content).join(' ');
        const inputTokens = estimateTokens(inputText);
        let outputChars = 0;

        const responseStream = new ReadableStream({
            async start(controller) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // Fire-and-forget token usage recording — don't block the stream close
                        const totalTokens = inputTokens + estimateTokens('x'.repeat(outputChars));
                        supabase.from('token_usage').insert({
                            user_id: user.id,
                            model_id: modelId,
                            tokens_used: totalTokens,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } as any).then(({ error }: any) => {
                            if (error) console.error('Failed to record token usage:', error);
                        });

                        controller.close();
                        break;
                    }
                    outputChars += value.length;
                    controller.enqueue(encoder.encode(value));
                }
            },
        });

        const newTotal = tokensUsed + inputTokens;
        return new Response(responseStream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Quota-Used': String(newTotal),
                'X-Quota-Limit': String(quotaLimit),
            },
        });
    } catch (error) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}
