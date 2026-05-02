/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamNvidiaCompletion, parseSSEStream } from '@/lib/nvidia-nim';
import { streamGoogleCompletion } from '@/lib/google-ai';
import { Database } from '@/types/database';
import type { AttachmentPayload } from '@/types/attachments';

import { rejectCrossOrigin } from '@/lib/api/origin-guard';
import {
    checkRateAndQuota,
    estimateTokens,
    logRequest,
    recordTokenUsage,
} from '@/lib/api/quota';
import { surfaceServerError } from '@/lib/api/error-response';
import { getChatSystemPrompt } from '@/lib/system-prompt-loader';
import {
    CHAT_NVIDIA_TIMEOUT_MS,
    CHAT_GOOGLE_TIMEOUT_MS,
    DEFAULT_QUOTA_LIMIT,
    MAX_CHAT_HISTORY_TURNS,
    MAX_INPUT_CHARS,
} from '@/lib/limits';
import {
    buildHistory,
    buildUserContent,
    composeApiMessages,
} from '@/lib/chat/messages';
import { applyWebSearchTool } from '@/lib/chat/prompt-tools';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];

/**
 * POST /api/chat
 *
 * Streams a chat completion from NVIDIA NIM, gated by:
 *   - same-origin CSRF check
 *   - server-side input length cap (mirrors useChat.ts)
 *   - admin edit-mode kill switch
 *   - per-model availability + suspension
 *   - per-user account state (deleted / kicked / suspended)
 *   - rate limit (RPM) and per-model token quota (5h window)
 *
 * The orchestration is the route's only job — every concern above lives
 * in a helper under `lib/api/*`, `lib/chat/*`, or `lib/limits.ts`.
 */
export async function POST(request: NextRequest) {
    try {
        // ── CSRF guard ──────────────────────────────────────────────────────
        const forbidden = rejectCrossOrigin(request);
        if (forbidden) return forbidden;

        const supabase = await createClient();

        // ── Body parsing ────────────────────────────────────────────────────
        const {
            sessionId,
            messageId,
            content,
            model,
            systemPrompt: userSystemPrompt,
            attachments = [],
            tool,
            searchResults,
            searchResultsQuery,
        } = await request.json();

        const typedAttachments: AttachmentPayload[] = Array.isArray(attachments) ? attachments : [];

        if (!content) {
            return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
        }
        if (typeof content !== 'string' || content.length > MAX_INPUT_CHARS) {
            return NextResponse.json(
                {
                    error: `Message exceeds the maximum allowed length of ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
                },
                { status: 400 },
            );
        }

        const modelId: string = model || 'souvik-ai-1';

        // ── Batch 1: auth + queries that don't need user.id ─────────────────
        // Auth, admin settings, model row, and chat history all run in
        // parallel. Without this the route does 3 sequential round-trips.
        const [authRes, settingsRes, modelRes, chatHistoryRes] = await Promise.all([
            supabase.auth.getUser(),
            supabase.from('admin_settings').select('*').single(),
            supabase.from('models').select('*').eq('id', modelId).single(),
            sessionId && messageId
                ? supabase
                      .from('chat_messages')
                      .select('role, content')
                      .eq('session_id', sessionId)
                      .neq('id', messageId)
                      .order('created_at', { ascending: false })
                      .limit(MAX_CHAT_HISTORY_TURNS)
                : Promise.resolve({ data: null }),
        ]);

        const user = authRes.data.user;
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const adminSettings = settingsRes.data as AdminSettingsRow | null;
        if (adminSettings?.edit_mode) {
            return NextResponse.json(
                { error: 'We are currently updating our services, try again later.' },
                { status: 503 },
            );
        }

        const dbModel: any = modelRes.data;
        if (!dbModel) {
            return NextResponse.json({ error: 'Model not found' }, { status: 404 });
        }
        if (dbModel.is_suspended) {
            return NextResponse.json(
                { error: "This model is currently suspended. We're working on it." },
                { status: 503 },
            );
        }

        const quotaLimit: number = dbModel.quota_limit ?? DEFAULT_QUOTA_LIMIT;

        // ── Batch 2: profile + rate limit + quota check ─────────────────────
        const [profileRes, gateRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            checkRateAndQuota(supabase, user.id, modelId, quotaLimit),
        ]);

        // Profile validation
        const userProfile = profileRes.data as unknown as ProfileRow;
        if (!userProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (userProfile.is_deleted)
            return NextResponse.json({ error: 'Account has been deleted' }, { status: 403 });
        if (userProfile.is_kicked)
            return NextResponse.json(
                { error: 'You have been kicked out of the model quota.' },
                { status: 403 },
            );
        if (userProfile.suspended_until && new Date(userProfile.suspended_until) > new Date()) {
            return NextResponse.json(
                {
                    error: 'Your account is suspended',
                    until: userProfile.suspended_until,
                    reason: userProfile.suspension_reason,
                },
                { status: 403 },
            );
        }

        if (gateRes.response) return gateRes.response;
        const tokensUsed = gateRes.tokensUsed;

        // ── Log request (fire-and-forget) ───────────────────────────────────
        logRequest(supabase, user.id, modelId);

        // ── Build the prompt payload ────────────────────────────────────────
        const history = buildHistory(chatHistoryRes.data as { role: string; content: string | null }[] | null);
        const userContent = buildUserContent(content, typedAttachments);

        let systemPrompt = await getChatSystemPrompt();
        if (userSystemPrompt && typeof userSystemPrompt === 'string' && userSystemPrompt.trim().length > 0) {
            systemPrompt += `\n\nUser Custom Instructions:\n${userSystemPrompt}`;
        }

        const apiMessages = composeApiMessages(systemPrompt, history, userContent);
        applyWebSearchTool(apiMessages, { tool, searchResults, searchResultsQuery });

        // ── Stream from NVIDIA with a hard timeout ──────────────────────────
        const temperature = adminSettings?.temperature ?? 0.7;
        const maxTokens = adminSettings?.max_tokens ?? 1024;
        const modelName = dbModel.name || adminSettings?.model_name || 'meta/llama-3.1-8b-instruct';
        const provider: 'nvidia' | 'google' = (dbModel.provider ?? 'nvidia') as 'nvidia' | 'google';

        const timeoutMs = provider === 'google' ? CHAT_GOOGLE_TIMEOUT_MS : CHAT_NVIDIA_TIMEOUT_MS;
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

        // textStream is a ReadableStream<string> regardless of provider —
        // google-ai.ts and parseSSEStream(nvidia) both expose the same surface.
        let textStream: ReadableStream<string>;
        try {
            if (provider === 'google') {
                textStream = await streamGoogleCompletion(apiMessages, {
                    model: modelName,
                    temperature,
                    maxTokens,
                    signal: timeoutController.signal,
                });
            } else {
                const rawStream = await streamNvidiaCompletion(apiMessages, {
                    model: modelName,
                    temperature,
                    maxTokens,
                    signal: timeoutController.signal,
                });
                textStream = parseSSEStream(rawStream);
            }
        } catch (err) {
            clearTimeout(timeoutId);
            // Node 18+ wraps an aborted fetch in a TypeError whose .cause is
            // the real AbortError — check both layers.
            const cause = (err as NodeJS.ErrnoException)?.cause as Error | undefined;
            const isTimeout =
                (err as Error)?.name === 'AbortError' ||
                cause?.name === 'AbortError';
            console.error(`[Chat] ${provider} stream error:`, err);
            return NextResponse.json(
                {
                    error: isTimeout
                        ? 'The AI model took too long to respond. Please try again.'
                        : `Model error: ${(err as Error).message}`,
                },
                { status: isTimeout ? 504 : 502 },
            );
        }

        clearTimeout(timeoutId);
        const reader = textStream.getReader();
        const encoder = new TextEncoder();

        const inputText = apiMessages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
        const inputTokens = estimateTokens(inputText);
        let outputChars = 0;

        const responseStream = new ReadableStream({
            async start(controller) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        const totalTokens = inputTokens + estimateTokens('x'.repeat(outputChars));
                        recordTokenUsage(supabase, user.id, modelId, totalTokens);
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
                Connection: 'keep-alive',
                'X-Quota-Used': String(newTotal),
                'X-Quota-Limit': String(quotaLimit),
            },
        });
    } catch (error) {
        return surfaceServerError(error, 'Failed to process request', '[Chat] POST error:');
    }
}
