import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamNvidiaCompletion, parseSSEStream } from '@/lib/nvidia-nim';
import { Database } from '@/types/database';
import { buildBuilderSystemPrompt } from '@/lib/code-agent/system-prompt';
import { BuilderTagStreamParser } from '@/lib/code-agent/parser';
import {
    applyFileAction,
    fetchWorkspaceFiles,
    insertBuilderMessage,
    loadWorkspaceForUser,
} from '@/lib/code-agent/db';
import type {
    BuilderFileAction,
    BuilderStep,
    BuilderStreamEvent,
} from '@/types/code';

export const runtime = 'nodejs';

type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];

/** Mirror of the regular chat quota: 5h sliding window, 20 RPM. */
const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000;
const RPM_LIMIT = 20;
const NVIDIA_TIMEOUT_MS = 45_000; // generous — agent turns produce more tokens
const MAX_INPUT_CHARS = 40_000;
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_CHARS_PER_TURN = 4_000;
/**
 * One "turn" from the user's perspective may be split into several phases
 * when the agent uses the read-file tool: phase 1 streams until the agent
 * emits `<read>` tags, then we feed the requested files back and run another
 * phase. Capped to keep cost & latency bounded.
 */
const MAX_AGENT_PHASES = 3;
/** Per file cap for content injected back into a read-result tool message. */
const MAX_READ_RESULT_CHARS_PER_FILE = 32_000;

interface AgentRequestBody {
    /** Workspace this turn belongs to. Server is the source of truth. */
    workspaceId: string;
    /**
     * Optional new user message. If omitted, the agent runs against whatever
     * is currently in the DB (used to auto-resume after a workspace was
     * created with an initial message).
     */
    message?: string;
    /** Optional model id (resolves against the `models` table; 'auto' picks one). */
    model?: string;
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function encodeEvent(ev: BuilderStreamEvent): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(ev) + '\n');
}

function genStepId(): string {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
        const workspaceId = (body.workspaceId ?? '').toString();
        const newMessage = (body.message ?? '').toString();
        const requestedModel = body.model || 'auto';

        if (!workspaceId) {
            return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        if (newMessage.length > MAX_INPUT_CHARS) {
            return NextResponse.json(
                {
                    error: `Message exceeds the maximum allowed length of ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
                },
                { status: 400 },
            );
        }

        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── Admin settings + models in parallel ──────────────────────────────
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const windowStart = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();

        const [settingsRes, modelsRes] = await Promise.all([
            supabase.from('admin_settings').select('*').single(),
            supabase.from('models').select('*'),
        ]);

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

        // ── Per-user rate / quota ────────────────────────────────────────────
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

        // ── Persist the new user message (if provided) ───────────────────────
        if (newMessage.trim()) {
            try {
                await insertBuilderMessage(supabase, {
                    workspaceId,
                    userId: user.id,
                    role: 'user',
                    content: newMessage.trim(),
                });
            } catch (err) {
                console.error('[Builder] Failed to insert user message:', err);
                return NextResponse.json(
                    { error: 'Failed to save your message. Please try again.' },
                    { status: 500 },
                );
            }
        }

        // ── Load workspace state from the DB (source of truth) ───────────────
        const workspace = await loadWorkspaceForUser(supabase, workspaceId, user.id);
        if (!workspace) {
            return NextResponse.json(
                { error: 'Workspace not found' },
                { status: 404 },
            );
        }

        // The most recent user message must be unanswered (no following
        // assistant message). Otherwise this is a duplicate / stale call.
        const lastMsg = workspace.messages[workspace.messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'user') {
            return NextResponse.json(
                { error: 'No pending user message to respond to.' },
                { status: 400 },
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
        const systemPrompt = buildBuilderSystemPrompt(workspace.files);

        // History excludes the just-inserted user message; we send that
        // separately as the final user turn so the model has it as the
        // current request.
        const priorMessages = workspace.messages.slice(0, -1);
        const trimmed = priorMessages.slice(-MAX_HISTORY_TURNS).map((m) => ({
            role: m.role,
            content: renderHistoryContent(m.role, m.content, m.steps ?? []),
        }));

        const apiMessages = [
            { role: 'system' as const, content: systemPrompt },
            ...trimmed,
            { role: 'user' as const, content: lastMsg.content },
        ];

        const temperature = adminSettings?.temperature ?? 0.6;
        const maxTokens = Math.max(adminSettings?.max_tokens ?? 0, 4096);
        const modelName: string =
            dbModel.name || adminSettings?.model_name || 'meta/llama-3.1-8b-instruct';

        // ── Stream from NVIDIA, parse tags into NDJSON events ────────────────
        // A turn is split into 1–MAX_AGENT_PHASES phases. Each phase calls
        // the model once. If the model emits `<read>` tags, we run another
        // phase with the requested file contents fed back as a tool result.

        // Server-side mirror of the conversation that gets persisted at end.
        const stepsAcc: BuilderStep[] = [];
        let textAcc = '';
        let outputChars = 0;
        const inputTokens = estimateTokens(apiMessages.map((m) => m.content).join(' '));

        // Serialize DB writes for file actions so create→edit→delete on the
        // same path always lands in the right order.
        let writeChain: Promise<void> = Promise.resolve();
        const queueWrite = (op: () => Promise<void>) => {
            writeChain = writeChain.then(op).catch((err) => {
                console.error('[Builder Agent] file write failed:', err);
            });
        };

        const closeOpenMilestone = () => {
            for (let i = stepsAcc.length - 1; i >= 0; i--) {
                const s = stepsAcc[i];
                if (s.kind === 'milestone' && s.status === 'doing') {
                    stepsAcc[i] = { ...s, status: 'done' };
                    return;
                }
            }
        };

        // Tracks state shared between the phase loop and the per-phase event
        // handler. `requestedReads` is reset at the start of each phase.
        const phaseState = {
            phaseText: '',
            requestedReads: [] as string[],
        };

        // Mirror the parsed event into our server-side accumulators. We do
        // this in addition to forwarding the raw event downstream so we can
        // persist the final assistant turn (timeline + content) once the
        // stream completes, and so file actions get queued for DB writes in
        // the order they're emitted.
        const handleServerEvent = (ev: BuilderStreamEvent) => {
            if (ev.type === 'text') {
                phaseState.phaseText += ev.delta;
                textAcc += ev.delta;
                return;
            }
            if (ev.type === 'milestone') {
                closeOpenMilestone();
                stepsAcc.push({
                    id: genStepId(),
                    kind: 'milestone',
                    text: ev.text,
                    status: 'doing',
                });
                return;
            }
            if (ev.type === 'action') {
                stepsAcc.push({
                    id: genStepId(),
                    kind: 'action',
                    action: ev.action,
                    status: 'done',
                });
                queueWrite(() => persistAction(supabase, workspaceId, ev.action));
                return;
            }
            if (ev.type === 'read') {
                stepsAcc.push({
                    id: genStepId(),
                    kind: 'read',
                    path: ev.path,
                    status: 'done',
                });
                phaseState.requestedReads.push(ev.path);
                return;
            }
        };

        // The currently-active upstream reader. Tracked so `cancel()` can tear
        // down whichever phase is in flight when the client disconnects.
        let activeReader: ReadableStreamDefaultReader<string> | null = null;
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), NVIDIA_TIMEOUT_MS);

        const out = new ReadableStream<Uint8Array>({
            async start(controller) {
                let errored = false;
                let phaseMessages = apiMessages;

                try {
                    for (let phase = 1; phase <= MAX_AGENT_PHASES; phase++) {
                        phaseState.phaseText = '';
                        phaseState.requestedReads = [];

                        let upstream: ReadableStream<Uint8Array>;
                        try {
                            upstream = await streamNvidiaCompletion(phaseMessages, {
                                model: modelName,
                                temperature,
                                maxTokens,
                                signal: timeoutController.signal,
                            });
                        } catch (err) {
                            const isTimeout = (err as Error)?.name === 'AbortError';
                            console.error('[Builder Agent] upstream error:', err);
                            controller.enqueue(
                                encodeEvent({
                                    type: 'error',
                                    message: isTimeout
                                        ? 'The model took too long to respond. Please try again.'
                                        : `Model error: ${(err as Error).message}`,
                                }),
                            );
                            errored = true;
                            break;
                        }

                        const reader = parseSSEStream(upstream).getReader();
                        activeReader = reader;
                        const parser = new BuilderTagStreamParser();
                        const stripThink = createThinkStripper();

                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;

                                outputChars += value.length;
                                const cleaned = stripThink(value);

                                for (const ev of parser.feed(cleaned)) {
                                    handleServerEvent(ev);
                                    controller.enqueue(encodeEvent(ev));
                                }
                            }
                            for (const ev of parser.flush()) {
                                handleServerEvent(ev);
                                controller.enqueue(encodeEvent(ev));
                            }
                        } finally {
                            activeReader = null;
                        }

                        if (phaseState.requestedReads.length === 0) {
                            // Phase finished without asking for more files —
                            // we're done.
                            break;
                        }

                        if (phase >= MAX_AGENT_PHASES) {
                            // Hit the cap — stop here and record a soft warning.
                            controller.enqueue(
                                encodeEvent({
                                    type: 'error',
                                    message:
                                        'Reached the read-tool limit for this turn. Send a follow-up to continue.',
                                }),
                            );
                            break;
                        }

                        // Wait for any in-flight file writes from this phase
                        // before fetching fresh content for the next one.
                        try {
                            await writeChain;
                        } catch {
                            /* logged inside queueWrite */
                        }

                        // Fulfil the read tool call and prepare the next phase.
                        const freshFiles = await fetchWorkspaceFiles(supabase, workspaceId);
                        const toolMessage = renderReadToolResult(
                            phaseState.requestedReads,
                            freshFiles,
                        );

                        // Rebuild the system prompt with the freshest file
                        // listing — the model needs to see edits it just made.
                        phaseMessages = [
                            { role: 'system' as const, content: buildBuilderSystemPrompt(freshFiles) },
                            ...phaseMessages.slice(1),
                            // The assistant's response from the just-finished
                            // phase, including the `<read>` tags. Including it
                            // verbatim lets the model continue its own thread.
                            { role: 'assistant' as const, content: phaseState.phaseText },
                            { role: 'user' as const, content: toolMessage },
                        ];
                    }

                    closeOpenMilestone();
                    controller.enqueue(encodeEvent({ type: 'done' }));
                } catch (err) {
                    errored = true;
                    console.error('[Builder Agent] stream error:', err);
                    controller.enqueue(
                        encodeEvent({
                            type: 'error',
                            message: 'The agent stream was interrupted.',
                        }),
                    );
                } finally {
                    clearTimeout(timeoutId);

                    // Wait for any in-flight file writes to settle, then
                    // persist the final assistant message + record token usage.
                    queueWrite(async () => {
                        try {
                            await insertBuilderMessage(supabase, {
                                workspaceId,
                                userId: user.id,
                                role: 'assistant',
                                content: textAcc.trim(),
                                steps: stepsAcc,
                                errored,
                            });
                        } catch (err) {
                            console.error('[Builder Agent] persist final message failed:', err);
                        }
                    });
                    try {
                        await writeChain;
                    } catch {
                        /* logged inside queueWrite */
                    }

                    const totalTokens =
                        inputTokens + estimateTokens('x'.repeat(outputChars));
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
                    activeReader?.cancel();
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
 * Persist a single agent file action, swallowing per-action errors so one
 * failure doesn't tear down the whole stream.
 */
async function persistAction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    workspaceId: string,
    action: BuilderFileAction,
): Promise<void> {
    try {
        await applyFileAction(supabase, workspaceId, action);
    } catch (err) {
        const target = action.kind === 'rename' ? `${action.from} -> ${action.to}` : action.path;
        console.error('[Builder Agent] persist action failed:', action.kind, target, err);
    }
}

/**
 * Compress an old turn into a single string the model can use as history.
 * For assistant turns we summarise the timeline (milestones + applied
 * actions) instead of replaying every token — keeps context small.
 */
function renderHistoryContent(
    role: 'user' | 'assistant',
    content: string,
    steps: BuilderStep[],
): string {
    if (role === 'user') {
        return content.length > MAX_HISTORY_CHARS_PER_TURN
            ? content.slice(0, MAX_HISTORY_CHARS_PER_TURN) + ' [truncated]'
            : content;
    }
    const parts: string[] = [];
    for (const s of steps) {
        if (s.kind === 'milestone') {
            parts.push(`• ${s.text}`);
        } else if (s.kind === 'read') {
            parts.push(`[read] ${s.path}`);
        } else if (s.action.kind === 'rename') {
            parts.push(`[rename] ${s.action.from} → ${s.action.to}`);
        } else {
            parts.push(`[${s.action.kind}] ${s.action.path}`);
        }
    }
    if (content.trim()) parts.push(content.trim());
    const joined = parts.join('\n');
    return joined.length > MAX_HISTORY_CHARS_PER_TURN
        ? joined.slice(0, MAX_HISTORY_CHARS_PER_TURN) + ' [truncated]'
        : joined;
}

/**
 * Render the synthetic user message that fulfils a batch of `<read>` tool
 * calls. Each requested file is included in full (subject to a generous
 * per-file cap), or marked NOT FOUND if it doesn't exist in the workspace.
 *
 * Duplicate paths in the request are deduped — the model sometimes asks for
 * the same file twice if it's iterating.
 */
function renderReadToolResult(
    paths: string[],
    files: Record<string, string>,
): string {
    const seen = new Set<string>();
    const blocks: string[] = [];
    for (const p of paths) {
        if (seen.has(p)) continue;
        seen.add(p);
        const raw = files[p];
        if (raw === undefined) {
            blocks.push(`--- FILE NOT FOUND: ${p} ---`);
            continue;
        }
        let content = raw;
        let suffix = '';
        if (content.length > MAX_READ_RESULT_CHARS_PER_FILE) {
            content = content.slice(0, MAX_READ_RESULT_CHARS_PER_FILE);
            suffix = `\n... [further content truncated; original length ${raw.length} chars]`;
        }
        blocks.push(`--- FILE: ${p} ---\n${content}${suffix}\n--- END FILE ---`);
    }
    return [
        '<read-result>',
        blocks.join('\n\n'),
        '</read-result>',
        '',
        'Above are the full contents you requested. Continue your previous task using these contents — emit milestones, file actions, and a final summary as usual. Do not emit `<read>` again unless you genuinely need another file.',
    ].join('\n');
}

/**
 * NVIDIA NIM emits its reasoning between `<think>...</think>` blocks. Hide
 * those from the Builder UI — only the final-answer text and tags reach the
 * tag parser. State is per-request to avoid cross-invocation leaks.
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
                if (close === -1) break; // drop rest of chunk; still inside
                inside = false;
                i = close + '</think>'.length;
            }
        }
        return out;
    };
}
