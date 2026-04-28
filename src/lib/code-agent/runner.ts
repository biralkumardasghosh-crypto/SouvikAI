/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamNvidiaCompletion, parseSSEStream } from '@/lib/nvidia-nim';
import { buildBuilderSystemPrompt } from './system-prompt';
import { BuilderTagStreamParser } from './parser';
import { renderReadToolResult } from './tools/read';
import { fetchWorkspaceFiles, insertBuilderMessage } from './db';
import { createThinkStripper } from './think-stripper';
import { encodeEvent } from './ndjson-emit';
import { createTurnAccumulator } from './timeline';
import { estimateTokens, recordTokenUsage } from '@/lib/api/quota';
import { BUILDER_NVIDIA_TIMEOUT_MS } from '@/lib/limits';

/**
 * One "turn" from the user's perspective may be split into several phases
 * when the agent uses the read-file tool: phase 1 streams until the agent
 * emits `<read>` tags, then we feed the requested files back and run another
 * phase. Capped to keep cost & latency bounded.
 */
const MAX_AGENT_PHASES = 3;

export interface AgentRunOptions {
    supabase: any;
    workspaceId: string;
    userId: string;
    modelId: string;
    modelName: string;
    temperature: number;
    maxTokens: number;
    /** Initial messages array (system + history + final user turn). */
    apiMessages: Array<{ role: string; content: string }>;
}

/**
 * Build the NDJSON ReadableStream that the route returns to the browser.
 *
 * Responsibilities:
 *  - Drive the phase loop, calling NVIDIA each phase until the agent stops
 *    asking for more files (or MAX_AGENT_PHASES is hit).
 *  - Forward each parsed event downstream and into a server-side
 *    accumulator that gets persisted at end-of-turn.
 *  - Serialize per-file DB writes so the timeline order matches the
 *    on-disk order.
 *  - Record token usage on close, regardless of error path.
 */
export function runAgentTurn(opts: AgentRunOptions): ReadableStream<Uint8Array> {
    const {
        supabase,
        workspaceId,
        userId,
        modelId,
        modelName,
        temperature,
        maxTokens,
        apiMessages,
    } = opts;

    const { acc, awaitWrites, enqueueWrite } = createTurnAccumulator(supabase, workspaceId);
    let outputChars = 0;
    const inputTokens = estimateTokens(
        apiMessages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' '),
    );

    let activeReader: ReadableStreamDefaultReader<string> | null = null;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), BUILDER_NVIDIA_TIMEOUT_MS);

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            let errored = false;
            let phaseMessages = apiMessages;

            try {
                for (let phase = 1; phase <= MAX_AGENT_PHASES; phase++) {
                    acc.startPhase();

                    let upstream: ReadableStream<Uint8Array>;
                    try {
                        upstream = await streamNvidiaCompletion(phaseMessages as any, {
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
                                acc.handle(ev);
                                controller.enqueue(encodeEvent(ev));
                            }
                        }
                        for (const ev of parser.flush()) {
                            acc.handle(ev);
                            controller.enqueue(encodeEvent(ev));
                        }
                    } finally {
                        activeReader = null;
                    }

                    if (acc.requestedReads.length === 0) break;

                    if (phase >= MAX_AGENT_PHASES) {
                        controller.enqueue(
                            encodeEvent({
                                type: 'error',
                                message:
                                    'Reached the read-tool limit for this turn. Send a follow-up to continue.',
                            }),
                        );
                        break;
                    }

                    // Drain in-flight file writes so the read tool sees fresh
                    // content from this same phase.
                    await awaitWrites();

                    const freshFiles = await fetchWorkspaceFiles(supabase, workspaceId);
                    const toolMessage = renderReadToolResult(acc.requestedReads, freshFiles);

                    // Rebuild the system prompt with the freshest file listing.
                    phaseMessages = [
                        { role: 'system', content: buildBuilderSystemPrompt(freshFiles) },
                        ...phaseMessages.slice(1),
                        { role: 'assistant', content: acc.phaseText },
                        { role: 'user', content: toolMessage },
                    ];
                }

                acc.closeOpenMilestone();
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

                // Persist the final assistant message at the end of the
                // write chain so it lands AFTER any pending file writes.
                enqueueWrite(async () => {
                    try {
                        await insertBuilderMessage(supabase, {
                            workspaceId,
                            userId,
                            role: 'assistant',
                            content: acc.text.trim(),
                            steps: acc.steps,
                            errored,
                        });
                    } catch (err) {
                        console.error('[Builder Agent] persist final message failed:', err);
                    }
                });
                await awaitWrites();

                const totalTokens = inputTokens + estimateTokens('x'.repeat(outputChars));
                recordTokenUsage(supabase, userId, modelId, totalTokens);

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
}
