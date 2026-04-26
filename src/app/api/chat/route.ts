import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamNvidiaCompletion, parseSSEStream } from '@/lib/nvidia-nim';
import { Database } from '@/types/database';
import type { AttachmentPayload } from '@/types/attachments';
import { formatSearchContext } from '@/lib/web-search';
import * as fs from 'fs/promises';
import * as path from 'path';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];

// ── Quota configuration ──────────────────────────────────────────────────────
const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours
const RPM_LIMIT = 20;

/** Must match the client-side cap in useChat.ts. */
const MAX_INPUT_CHARS = 40_000;

/** NVIDIA API timeout — fail fast so the client gets a real error, not a hung stream. */
const NVIDIA_TIMEOUT_MS = 25_000;

// ── System prompt — loaded async per-request with a simple in-process cache ──
// We avoid module-level synchronous fs.readFileSync which can crash serverless
// runtimes (e.g. Vercel) where process.cwd() resolves unexpectedly at cold-start.
let _systemPromptCache: string | null = null;

async function getSystemPrompt(): Promise<string> {
    // In development, never cache — always read fresh so edits to
    // system_prompt.txt take effect without restarting the server.
    if (process.env.NODE_ENV === 'development') {
        _systemPromptCache = null;
    }

    if (_systemPromptCache !== null) return _systemPromptCache;
    try {
        _systemPromptCache = await fs.readFile(
            path.join(process.cwd(), 'system_prompt.txt'),
            'utf-8'
        );
    } catch {
        console.warn('[Chat] Could not read system_prompt.txt, using default');
        _systemPromptCache = 'You are SouvikAI, a helpful and concise AI assistant.';
    }
    return _systemPromptCache;
}

// Rough token estimate: ~4 chars per token
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export async function POST(request: NextRequest) {
    try {
        // ── CSRF: this is a cookie-authenticated, state-changing endpoint, so
        // we require a same-origin browser request. We accept a request iff
        // EITHER:
        //   (a) the Origin header is present and matches Host, OR
        //   (b) the Sec-Fetch-Site header is 'same-origin' (modern browsers
        //       send this on every fetch — including cases where Origin is
        //       suppressed, e.g. older same-origin GETs).
        // Requests with no Origin AND no Sec-Fetch-Site are rejected: those
        // are the shape `curl`/script attackers typically produce when riding
        // a logged-in user's session token. There is no legitimate
        // server-to-server caller for this route — auth is via Supabase
        // cookies, which only browsers carry.
        const origin = request.headers.get('origin');
        const host   = request.headers.get('host');
        const secFetchSite = request.headers.get('sec-fetch-site');

        const normalise = (h: string) => h.replace(/:(?:80|443)$/, '');

        let originOk = false;
        if (origin && host) {
            try {
                originOk = normalise(new URL(origin).host) === normalise(host);
            } catch {
                originOk = false;
            }
        }
        const secFetchOk = secFetchSite === 'same-origin' || secFetchSite === 'none';

        if (!originOk && !secFetchOk) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        // If Origin IS present but mismatched, reject even if Sec-Fetch-Site
        // claims same-origin (defence in depth — Sec-Fetch-Site can be omitted
        // by user-agents we don't recognise, but Origin can't be spoofed by
        // browser JS).
        if (origin && host && !originOk) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const supabase = await createClient();

        // ── Parse request body first so we can use modelId / sessionId
        //    in all subsequent parallel queries without waiting for auth. ────────
        const { sessionId, messageId, content, model, systemPrompt: userSystemPrompt, attachments = [], tool, searchResults, searchResultsQuery } = await request.json();
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
            // chat_messages only needs sessionId + messageId (both from body).
            // LIMIT to the last 20 messages — sending unlimited history adds
            // latency proportional to conversation length. 20 turns covers the
            // vast majority of context a model actually uses effectively.
            (sessionId && messageId)
                ? supabase.from('chat_messages').select('role, content')
                    .eq('session_id', sessionId)
                    .neq('id', messageId)
                    .order('created_at', { ascending: false })
                    .limit(20)
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
            model_id: modelId,
            status: 'completed',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).then(({ error }: any) => {
            if (error) console.error('Failed to log request:', error);
        });

        // ── Build conversation history ────────────────────────────────────────────
        // Messages come back newest-first (DESC) so we reverse to restore
        // chronological order. Each message is trimmed to 4,000 chars to avoid
        // a single huge attachment/paste blowing up the context window.
        const MAX_HISTORY_CHARS = 4_000;
        let conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
        if (chatHistoryRes.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            conversationHistory = (chatHistoryRes.data as any[])
                .reverse()                          // restore chronological order
                .map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: typeof m.content === 'string' && m.content.length > MAX_HISTORY_CHARS
                        ? m.content.slice(0, MAX_HISTORY_CHARS) + ' [truncated]'
                        : m.content,
                }));
        }

        // ── Build system prompt (cached async read — zero cost on warm instances) ─
        let systemPrompt = await getSystemPrompt();
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

        // ── Web search context injection ─────────────────────────────────────
        // The client performs the search BEFORE calling this route whenever the
        // user clicks the "Search the web" tool, then forwards the results
        // here. We never ask the model to decide whether/what to search via
        // prompt-based <search> tags — that approach was unreliable (small
        // models often ignored or malformed the tag, leading to no shimmer
        // or empty result sets). The model is simply given grounded context
        // and asked to answer.
        if (Array.isArray(searchResults) && searchResults.length > 0) {
            apiMessages.splice(apiMessages.length - 1, 0, {
                role: 'system' as const,
                content: formatSearchContext(searchResultsQuery || 'Search', searchResults),
            });
        } else if (tool === 'searchWeb') {
            // Search returned zero results — tell the model so it can be honest
            // with the user instead of fabricating citations.
            apiMessages.splice(apiMessages.length - 1, 0, {
                role: 'system' as const,
                content: formatSearchContext(searchResultsQuery || content, []),
            });
        }

        const temperature = adminSettings?.temperature ?? 0.7;
        // Default to 1024 — covers ~750 words which handles most responses well.
        // 2048 was the old default; the difference in TTFT is significant because
        // the model has to plan token budgets before generating the first token.
        const maxTokens = adminSettings?.max_tokens ?? 1024;
        const modelName = dbModel.name || adminSettings?.model_name || 'meta/llama-3.1-8b-instruct';

        // ── Stream response + track tokens ───────────────────────────────────────
        // A per-request AbortController ensures the NVIDIA fetch is cancelled
        // (and the client gets a real error) if the model doesn't respond within
        // NVIDIA_TIMEOUT_MS. Without this the serverless function silently times
        // out and the client sees a generic NetworkError.
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(
            () => timeoutController.abort(),
            NVIDIA_TIMEOUT_MS
        );

        let stream: ReadableStream<Uint8Array>;
        try {
            stream = await streamNvidiaCompletion(apiMessages, {
                model: modelName,
                temperature,
                maxTokens,
                signal: timeoutController.signal,
            });
        } catch (err) {
            clearTimeout(timeoutId);
            const isTimeout = (err as Error)?.name === 'AbortError';
            console.error('[Chat] NVIDIA stream error:', err);
            return NextResponse.json(
                { error: isTimeout
                    ? 'The AI model took too long to respond. Please try again.'
                    : `Model error: ${(err as Error).message}` },
                { status: isTimeout ? 504 : 502 }
            );
        }

        clearTimeout(timeoutId);
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
