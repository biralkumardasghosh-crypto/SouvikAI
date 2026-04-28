import type { BuilderStep, BuilderFileAction, BuilderStreamEvent } from '@/types/code';
import { applyFileAction } from './db';
import { genStepId } from './ndjson-emit';

/**
 * Server-side mirror of the assistant turn currently in flight: the steps
 * timeline plus the running text. Owns:
 *   - the milestone "open vs done" lifecycle
 *   - the FIFO write chain that serializes per-file mutations so
 *     create→edit→delete on the same path always lands in order
 *   - the list of file paths the agent has asked to read this phase
 *
 * The route's per-event handler dispatches into here; the runner uses the
 * accumulator at the end of the turn to persist the final assistant
 * message.
 */
export interface TurnAccumulator {
    /** Append-only timeline of steps emitted so far. */
    steps: BuilderStep[];
    /** Concatenated assistant text across all phases. */
    text: string;
    /** Reset between phases — paths the agent asked to read. */
    requestedReads: string[];
    /** Per-phase text — used as the assistant turn fed back to phase 2. */
    phaseText: string;

    /** Apply one stream event to the accumulator (no DB writes). */
    handle(ev: BuilderStreamEvent): void;
    /** Mark the still-open milestone (if any) as done. */
    closeOpenMilestone(): void;
    /** Reset per-phase counters at the start of each new phase. */
    startPhase(): void;
}

/**
 * Wire up an accumulator and a serialized FS-write chain. Calling
 * `awaitWrites()` flushes any in-flight DB ops; `enqueueWrite()` is used
 * by the action handler so the route never blocks the stream on disk.
 */
export function createTurnAccumulator(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    workspaceId: string,
): {
    acc: TurnAccumulator;
    awaitWrites(): Promise<void>;
    enqueueWrite(op: () => Promise<void>): void;
} {
    let writeChain: Promise<void> = Promise.resolve();
    const enqueueWrite = (op: () => Promise<void>) => {
        writeChain = writeChain.then(op).catch((err) => {
            console.error('[Builder Agent] file write failed:', err);
        });
    };

    const acc: TurnAccumulator = {
        steps: [],
        text: '',
        requestedReads: [],
        phaseText: '',

        startPhase() {
            this.requestedReads = [];
            this.phaseText = '';
        },

        closeOpenMilestone() {
            for (let i = this.steps.length - 1; i >= 0; i--) {
                const s = this.steps[i];
                if (s.kind === 'milestone' && s.status === 'doing') {
                    this.steps[i] = { ...s, status: 'done' };
                    return;
                }
            }
        },

        handle(ev) {
            if (ev.type === 'text') {
                this.phaseText += ev.delta;
                this.text += ev.delta;
                return;
            }
            // `action-start` is a UI-only hint — the timeline gets the full
            // record from the `action` event once the body lands.
            if (ev.type === 'action-start') return;
            if (ev.type === 'milestone') {
                this.closeOpenMilestone();
                this.steps.push({
                    id: genStepId(),
                    kind: 'milestone',
                    text: ev.text,
                    status: 'doing',
                });
                return;
            }
            if (ev.type === 'action') {
                this.steps.push({
                    id: genStepId(),
                    kind: 'action',
                    action: ev.action,
                    status: 'done',
                });
                enqueueWrite(() => persistAction(supabase, workspaceId, ev.action));
                return;
            }
            if (ev.type === 'read') {
                this.steps.push({
                    id: genStepId(),
                    kind: 'read',
                    path: ev.path,
                    status: 'done',
                });
                this.requestedReads.push(ev.path);
                return;
            }
        },
    };

    return {
        acc,
        enqueueWrite,
        awaitWrites: () =>
            writeChain.catch(() => {
                /* errors logged in enqueueWrite */
            }),
    };
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
