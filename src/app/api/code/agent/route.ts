import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamNvidiaCompletion, parseSSEStream } from '@/lib/nvidia-nim';
import { Database } from '@/types/database';
import { buildBuilderSystemPrompt } from '@/lib/code-agent/system-prompt';
import { BuilderTagStreamParser } from '@/lib/code-agent/parser';
import type { BuilderFiles, BuilderStreamEvent } from '@/types/code';

type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];

/** Mirror of the regular chat quota: 5h sliding window, 20 RPM. */
const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000;
const RPM_LIMIT = 20;
const NVIDIA_TIMEOUT_MS = 45_000; // generous — agent turns produce more tokens
const MAX_INPUT_CHARS = 40_000;

interface AgentRequestBody {
    /** Stable id for this builder workspace (used for logging only). */
    sessionId: string;
    /** The user's new message for this turn. */
    message: string;
    /** Prior conversation, role-tagged, oldest first. Excludes the new message. */
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    /** Current state of the virtual file system. */
    files: BuilderFiles;
    /** Optional model id; resolved against the `models` table. */
    model?: string;
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function encodeEvent(ev: BuilderStreamEvent): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(ev) + '\n');
}

export async function POST(request: NextRequest) {
    try {
        // ── CSRF guard (mirrors /api/chat) ───────────────────────────────────
        const origin = request.headers.get('origin');
        const host = request.headers.get('host');
        if (origin && host) {
            try {
                const originHost = new URL(origin).host;
                const norm = (h: string) => h.replace(/:(?:80|443)$/, '');
                if (norm(originHost) !== norm(host)) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            } catch {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const body = (await request.json()) as Partial<AgentRequestBody>;
        const message = (body.message ?? '').toString();
        const history = Array.isArray(body.history) ? body.history : [];
        const files: BuilderFiles =
            body.files && typeof body.files === 'object' ? body.files : {};
        const requestedModel = body.model || 'auto';

        if (!message.trim()) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }
        if (message.length > MAX_INPUT_CHARS) {
            return NextResponse.json(
                { error: `Message exceeds the maximum allowed length of ${MAX_INPUT_CHARS.toLocaleString()} characters.` },
                { status: 400 },
            );
        }

        const supabase = await createClient();
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();

        // ── Resolve auth + admin settings + model in parallel ────────────────
        const [authRes, settingsRes, modelsRes] = await Promise.all([
            supabase.auth.getUser(),
            supabase.from('admin_settings').select('*').single(),
            supabase.from('models').select('*'),
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allModels: any[] = Array.isArray(modelsRes.data) ? modelsRes.data : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let dbModel: any = null;
        if (requestedModel === 'auto') {
            dbModel = allModels.find((m) => !m.is_suspended) ?? allModels[0];
        } else {
            dbModel = allModels.find((m) => m.id === requestedModel);
        }
        if (!dbModel) {
            return NextResponse.json({ error: 'Model not found' }, { status: 404 });
        }
        if (dbModel.is_suspended) {
            return NextResponse.json(
                { error: "This model is currently suspended. We're working on it." },
                { status: 503 },
            );
        }

        const modelId: string = dbModel.id;
        const quotaLimit: number = dbModel.quota_limit ?? 500_000;

        // ── Per-user rate / quota checks (parallel) ──────────────────────────
        const [recentRequestsRes, usageRowsRes] = await Promise.all([
            supabase
                .from('requests_log')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('created_at', oneMinuteAgo),
            supabase
                .from('token_usage')
                .select('tokens_used')
                .eq('user_id', user.id)
                .eq('model_id', modelId)
                .gte('created_at', windowStart),
        ]);

        if ((recentRequestsRes.count ?? 0) >= RPM_LIMIT) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. You can send up to 20 messages per minute.' },
                { status: 429 },
            );
        }

        const tokensUsed = (usageRowsRes.data ?? []).reduce(
            (sum: number, r: { tokens_used: number }) => sum + r.tokens_used,
            0,
        );
        if (tokensUsed >= quotaLimit) {
            return NextResponse.json(
                {
                    error:
                        'Token quota exceeded for this model. Please wait for the 5-hour window to reset.',
                    quotaExceeded: true,
                    used: tokensUsed,
                    limit: quotaLimit,
                },
                {
                    status: 429,
                    headers: {
                        'X-Quota-Used': String(tokensUsed),
                        'X-Quota-Limit': String(quotaLimit),
                    },
                },
            );
        }

        // Fire-and-forget request log.
        supabase
            .from('requests_log')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert({ user_id: user.id, model_id: modelId, status: 'completed' } as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(({ error }: any) => {
                if (error) console.error('Failed to log request:', error);
            });

        // ── Build prompt ─────────────────────────────────────────────────────
        const systemPrompt = buildBuilderSystemPrompt(files);

        // History is intentionally trimmed: only the last 12 turns to keep the
        // context lean — the file listing carries the heavy state.
        const trimmedHistory = history.slice(-12).map((m) => ({
            role: m.role,
            content:
                typeof m.content === 'string' && m.content.length > 4_000
                    ? m.content.slice(0, 4_000) + ' [truncated]'
                    : m.content,
        }));

        const apiMessages = [
            { role: 'system' as const, content: systemPrompt },
            ...trimmedHistory,
            { role: 'user' as const, content: message },
        ];

        const temperature = adminSettings?.temperature ?? 0.6;
        // Code generation eats tokens — cap higher than chat default.
        const maxTokens = Math.max(adminSettings?.max_tokens ?? 0, 4096);
        const modelName: string =
            dbModel.name || adminSettings?.model_name || 'meta/llama-3.1-8b-instruct';

        // ── Stream from NVIDIA, parse tags into NDJSON events ────────────────
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(
            () => timeoutController.abort(),
            NVIDIA_TIMEOUT_MS,
        );

        let upstream: ReadableStream<Uint8Array>;
        try {
            upstream = await streamNvidiaCompletion(apiMessages, {
                model: modelName,
                temperature,
                maxTokens,
                signal: timeoutController.signal,
            });
        } catch (err) {
            clearTimeout(timeoutId);
            const isTimeout = (err as Error)?.name === 'AbortError';
            console.error('[Builder Agent] upstream error:', err);
            return NextResponse.json(
                {
                    error: isTimeout
                        ? 'The model took too long to respond. Please try again.'
                        : `Model error: ${(err as Error).message}`,
                },
                { status: isTimeout ? 504 : 502 },
            );
        }

        const textStream = parseSSEStream(upstream);
        const reader = textStream.getReader();
        const parser = new BuilderTagStreamParser();
        const stripThink = createThinkStripper();

        const inputTokens = estimateTokens(apiMessages.map((m) => m.content).join(' '));
        let outputChars = 0;

        const out = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Strip <think>...</think> reasoning blocks from the
                        // visible stream — Builder doesn't surface those.
                        outputChars += value.length;
                        const cleaned = stripThink(value);

                        for (const ev of parser.feed(cleaned)) {
                            controller.enqueue(encodeEvent(ev));
                        }
                    }

                    for (const ev of parser.flush()) {
                        controller.enqueue(encodeEvent(ev));
                    }
                    controller.enqueue(encodeEvent({ type: 'done' }));
                } catch (err) {
                    console.error('[Builder Agent] stream error:', err);
                    controller.enqueue(
                        encodeEvent({
                            type: 'error',
                            message: 'The agent stream was interrupted.',
                        }),
                    );
                } finally {
                    clearTimeout(timeoutId);

                    // Record token usage (fire-and-forget).
                    const totalTokens = inputTokens + estimateTokens('x'.repeat(outputChars));
                    supabase
                        .from('token_usage')
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .insert({
                            user_id: user.id,
                            model_id: modelId,
                            tokens_used: totalTokens,
                        } as never)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .then(({ error }: any) => {
                            if (error) console.error('Failed to record token usage:', error);
                        });

                    controller.close();
                }
            },
            cancel() {
                try {
                    reader.cancel();
                } catch {
                    /* ignore */
                }
                clearTimeout(timeoutId);
            },
        });

        const newTotal = tokensUsed + inputTokens;
        return new Response(out, {
            headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'X-Quota-Used': String(newTotal),
                'X-Quota-Limit': String(quotaLimit),
            },
        });
    } catch (error) {
        console.error('[Builder Agent] route error:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 },
        );
    }
}

/**
 * NVIDIA NIM emits its reasoning between `<think>...</think>` blocks. We hide
 * those from the Builder UI — only the final-answer text and tags should reach
 * the parser.
 *
 * `<think>` may open in one chunk and close in another, so the stripper keeps
 * a flag across calls. We instantiate one per request to avoid leaking state
 * between concurrent invocations on the same serverless instance.
 */
function createThinkStripper(): (chunk: string) => string {
    let inside = false;
    return (chunk: string): string => {
        let out = '';
        let i = 0;
        while (i < chunk.length) {
            if (!inside) {
                const open = chunk.indexOf('<think>', i);
                if (open === -1) {
                    out += chunk.slice(i);
                    break;
                }
                out += chunk.slice(i, open);
                inside = true;
                i = open + '<think>'.length;
            } else {
                const close = chunk.indexOf('</think>', i);
                if (close === -1) {
                    // Drop the rest of the chunk; we're still inside <think>.
                    break;
                }
                inside = false;
                i = close + '</think>'.length;
            }
        }
        return out;
    };
}
