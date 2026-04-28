'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    BuilderFileAction,
    BuilderFiles,
    BuilderMessage,
    BuilderStep,
    BuilderStreamEvent,
    BuilderWorkspace,
    PendingChange,
} from '@/types/code';
import { consumeNDJSONStream } from '@/lib/streaming/ndjson';
import {
    applyAction,
    buildPendingChanges,
    deriveWorkspaceTitle,
    genId,
    nextActiveFile,
} from './builder/file-state';
import {
    deleteWorkspaceFile,
    loadWorkspace,
    saveActiveFile,
    saveFile,
} from './builder/persistence';

interface HookState {
    workspace: BuilderWorkspace | null;
    isLoading: boolean;
    loadError: string | null;
    isStreaming: boolean;
    streamError: string | null;
    selectedModelId: string;
}

export interface UseBuilderAgentResult {
    workspace: BuilderWorkspace | null;
    isLoading: boolean;
    loadError: string | null;
    isStreaming: boolean;
    error: string | null;
    selectedModelId: string;
    setSelectedModelId: (next: string) => void;
    setActiveFile: (path: string | null) => void;
    updateFile: (path: string, content: string) => void;
    deleteFile: (path: string) => Promise<void>;
    /** Send a brand-new user message and stream the agent reply. */
    sendMessage: (text: string) => Promise<void>;
    /**
     * Resume the agent against the most recently persisted user message
     * (used right after workspace creation when the first user message was
     * inserted by the create endpoint).
     */
    resumePending: () => Promise<void>;
    abort: () => void;
    /**
     * Mark the given paths from a message's pending review as accepted.
     * Pass `paths = null` (the default) to accept every remaining change
     * for that message. Server already has the streamed result, so this
     * just clears the entries from the review queue.
     */
    acceptChanges: (messageId: string, paths?: string[] | null) => Promise<void>;
    /**
     * Roll back the given paths from a message's pending review. The
     * client `files` map is restored to the snapshot that was captured
     * when the agent's turn began, and the workspace files API is
     * called to revert the on-disk state too. Pass `paths = null` to
     * reject every remaining change.
     */
    rejectChanges: (messageId: string, paths?: string[] | null) => Promise<void>;
}

const PLACEHOLDER_WORKSPACE = (id: string): BuilderWorkspace => ({
    id,
    title: 'Loading…',
    files: {},
    activeFile: null,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
});

/**
 * Owns one Builder workspace session backed by Supabase.
 *
 *  • Hydrates the workspace from the server on mount.
 *  • Streams agent turns through `/api/code/agent`, applying NDJSON events
 *    optimistically while the server persists the canonical state.
 *  • In-editor edits are pushed to the server with debounced PUTs so the
 *    workspace survives reload regardless of which side made the change.
 */
export function useBuilderAgent(workspaceId: string): UseBuilderAgentResult {
    const [state, setState] = useState<HookState>(() => ({
        workspace: workspaceId ? PLACEHOLDER_WORKSPACE(workspaceId) : null,
        isLoading: !!workspaceId,
        loadError: null,
        isStreaming: false,
        streamError: null,
        selectedModelId: 'auto',
    }));

    const abortRef = useRef<AbortController | null>(null);
    const workspaceRef = useRef<BuilderWorkspace | null>(state.workspace);
    workspaceRef.current = state.workspace;

    // Debounced file save timers per path.
    const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    // Debounced active-file save timer.
    const activeFileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * Snapshot of `files` taken at the start of each agent turn, keyed by
     * the assistant message id. Survives the lifetime of the workspace so
     * "reject" still works on older messages within the session. Cleared
     * when every pending change for a message has been resolved.
     */
    const turnSnapshotsRef = useRef<Map<string, BuilderFiles>>(new Map());
    /** Per-turn list of file actions, accumulated as the stream arrives. */
    const turnActionsRef = useRef<BuilderFileAction[]>([]);

    // ── Hydration ────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!workspaceId) return;
        let cancelled = false;
        setState((s) => ({
            ...s,
            workspace: PLACEHOLDER_WORKSPACE(workspaceId),
            isLoading: true,
            loadError: null,
        }));

        (async () => {
            const result = await loadWorkspace(workspaceId);
            if (cancelled) return;
            if (!result.ok) {
                setState((s) => ({ ...s, isLoading: false, loadError: result.message }));
                return;
            }
            setState((s) => ({
                ...s,
                workspace: result.workspace,
                isLoading: false,
                loadError: null,
            }));
        })();

        return () => {
            cancelled = true;
        };
    }, [workspaceId]);

    // Cleanup pending timers on unmount. Capture the ref values into the
    // effect closure so the cleanup uses the same Map/timer that was live
    // when the effect mounted (silences exhaustive-deps in strict mode).
    useEffect(() => {
        const saveTimers = saveTimersRef.current;
        const activeFileTimer = activeFileTimerRef.current;
        return () => {
            saveTimers.forEach((t) => clearTimeout(t));
            saveTimers.clear();
            if (activeFileTimer) clearTimeout(activeFileTimer);
        };
    }, []);

    // ── State helpers ────────────────────────────────────────────────────────

    const updateAssistantMessage = useCallback(
        (id: string, mutate: (msg: BuilderMessage) => BuilderMessage) => {
            setState((s) => {
                if (!s.workspace) return s;
                return {
                    ...s,
                    workspace: {
                        ...s.workspace,
                        updatedAt: Date.now(),
                        messages: s.workspace.messages.map((m) => (m.id === id ? mutate(m) : m)),
                    },
                };
            });
        },
        [],
    );

    const setSelectedModelId = useCallback((next: string) => {
        setState((s) => ({ ...s, selectedModelId: next }));
    }, []);

    const setActiveFile = useCallback(
        (path: string | null) => {
            setState((s) => {
                if (!s.workspace) return s;
                return {
                    ...s,
                    workspace: { ...s.workspace, activeFile: path, updatedAt: Date.now() },
                };
            });

            // Persist with a small debounce so rapid clicks don't hammer
            // the server.
            if (activeFileTimerRef.current) clearTimeout(activeFileTimerRef.current);
            activeFileTimerRef.current = setTimeout(() => {
                saveActiveFile(workspaceId, path);
            }, 300);
        },
        [workspaceId],
    );

    const updateFile = useCallback(
        (path: string, content: string) => {
            setState((s) => {
                if (!s.workspace) return s;
                return {
                    ...s,
                    workspace: {
                        ...s.workspace,
                        files: { ...s.workspace.files, [path]: content },
                        updatedAt: Date.now(),
                    },
                };
            });

            // Debounced PUT — coalesce rapid keystrokes into one write per
            // 600ms-quiet-period per path.
            const timers = saveTimersRef.current;
            const existing = timers.get(path);
            if (existing) clearTimeout(existing);
            const handle = setTimeout(() => {
                timers.delete(path);
                saveFile(workspaceId, path, content);
            }, 600);
            timers.set(path, handle);
        },
        [workspaceId],
    );

    const deleteFile = useCallback(
        async (path: string) => {
            // Cancel any pending save for this path so we don't race the delete.
            const pending = saveTimersRef.current.get(path);
            if (pending) {
                clearTimeout(pending);
                saveTimersRef.current.delete(path);
            }

            setState((s) => {
                if (!s.workspace) return s;
                if (!(path in s.workspace.files)) return s;
                const nextFiles = { ...s.workspace.files };
                delete nextFiles[path];
                let activeFile = s.workspace.activeFile;
                if (activeFile === path) {
                    const keys = Object.keys(nextFiles);
                    activeFile = keys[0] ?? null;
                }
                return {
                    ...s,
                    workspace: {
                        ...s.workspace,
                        files: nextFiles,
                        activeFile,
                        updatedAt: Date.now(),
                    },
                };
            });

            await deleteWorkspaceFile(workspaceId, path);
        },
        [workspaceId],
    );

    const abort = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setState((s) => ({ ...s, isStreaming: false }));
    }, []);

    // ── Diff review (accept / reject) ────────────────────────────────────────

    /** Strip resolved entries (or all of them) from a message's review. */
    const consumePending = useCallback(
        (
            messageId: string,
            paths: string[] | null,
        ): PendingChange[] => {
            const ws = workspaceRef.current;
            if (!ws) return [];
            const message = ws.messages.find((m) => m.id === messageId);
            if (!message?.review) return [];
            const targetSet = paths === null ? null : new Set(paths);
            const taken: PendingChange[] = [];
            const remaining: PendingChange[] = [];
            for (const change of message.review.pending) {
                if (targetSet === null || targetSet.has(change.path)) {
                    taken.push(change);
                } else {
                    remaining.push(change);
                }
            }
            if (taken.length === 0) return [];

            setState((s) => {
                if (!s.workspace) return s;
                return {
                    ...s,
                    workspace: {
                        ...s.workspace,
                        updatedAt: Date.now(),
                        messages: s.workspace.messages.map((m) => {
                            if (m.id !== messageId || !m.review) return m;
                            return {
                                ...m,
                                review:
                                    remaining.length > 0
                                        ? { ...m.review, pending: remaining }
                                        : undefined,
                            };
                        }),
                    },
                };
            });

            // If nothing is left to review, the snapshot has served
            // its purpose.
            if (remaining.length === 0) {
                turnSnapshotsRef.current.delete(messageId);
            }
            return taken;
        },
        [],
    );

    const acceptChanges = useCallback(
        async (messageId: string, paths: string[] | null = null) => {
            // Server already has the streamed result and `files` was
            // updated optimistically as the agent worked, so accepting
            // is purely a bookkeeping step.
            consumePending(messageId, paths);
        },
        [consumePending],
    );

    const rejectChanges = useCallback(
        async (messageId: string, paths: string[] | null = null) => {
            const taken = consumePending(messageId, paths);
            if (taken.length === 0) return;

            // Apply the rollback to the local file map first so the
            // editor / preview update immediately, then mirror the
            // change to the server.
            setState((s) => {
                if (!s.workspace) return s;
                const nextFiles: BuilderFiles = { ...s.workspace.files };
                for (const change of taken) {
                    if (change.before === null) {
                        delete nextFiles[change.path];
                    } else {
                        nextFiles[change.path] = change.before;
                    }
                }
                let activeFile = s.workspace.activeFile;
                if (activeFile && !(activeFile in nextFiles)) {
                    activeFile = Object.keys(nextFiles)[0] ?? null;
                }
                return {
                    ...s,
                    workspace: {
                        ...s.workspace,
                        files: nextFiles,
                        activeFile,
                        updatedAt: Date.now(),
                    },
                };
            });

            // Cancel any debounced auto-save that might overwrite the
            // restored content with the now-stale streamed value.
            for (const change of taken) {
                const pending = saveTimersRef.current.get(change.path);
                if (pending) {
                    clearTimeout(pending);
                    saveTimersRef.current.delete(change.path);
                }
            }

            // Mirror the rollback to Supabase. We deliberately do NOT
            // await each one — the user's editor is already showing
            // the reverted state and these calls just bring the server
            // in line. Errors are logged inside the helpers.
            await Promise.all(
                taken.map((change) => {
                    if (change.before === null) {
                        return deleteWorkspaceFile(workspaceId, change.path);
                    }
                    // Fire-and-forget save; helper swallows errors.
                    saveFile(workspaceId, change.path, change.before);
                    return Promise.resolve();
                }),
            );
        },
        [consumePending, workspaceId],
    );

    // ── Streaming send ───────────────────────────────────────────────────────

    const runAgent = useCallback(
        async (opts: { newMessageText?: string }): Promise<void> => {
            const ws = workspaceRef.current;
            if (!ws) return;
            if (state.isStreaming) return;

            setState((s) => ({ ...s, streamError: null }));

            // Optimistic message updates: append the user message (if any) and
            // an empty assistant placeholder.
            const userMsg: BuilderMessage | null = opts.newMessageText
                ? {
                      id: genId('u'),
                      role: 'user',
                      content: opts.newMessageText.trim(),
                      createdAt: Date.now(),
                  }
                : null;
            const assistantMsg: BuilderMessage = {
                id: genId('a'),
                role: 'assistant',
                content: '',
                steps: [],
                isStreaming: true,
                createdAt: Date.now() + 1,
            };

            // Snapshot the current files BEFORE we mount the new
            // assistant message — anything the stream applies will be
            // diffed against this baseline. Stored on a ref so the
            // accept/reject handlers can later restore from it.
            turnSnapshotsRef.current.set(assistantMsg.id, { ...ws.files });
            turnActionsRef.current = [];

            setState((s) => {
                if (!s.workspace) return s;
                const nextMessages = [...s.workspace.messages];
                if (userMsg) nextMessages.push(userMsg);
                nextMessages.push(assistantMsg);
                return {
                    ...s,
                    isStreaming: true,
                    streamError: null,
                    workspace: {
                        ...s.workspace,
                        messages: nextMessages,
                        title:
                            s.workspace.messages.length === 0 && userMsg
                                ? deriveWorkspaceTitle(userMsg.content)
                                : s.workspace.title,
                        updatedAt: Date.now(),
                    },
                };
            });

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const res = await fetch('/api/code/agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workspaceId,
                        message: opts.newMessageText ?? undefined,
                        model: state.selectedModelId,
                    }),
                    signal: controller.signal,
                });

                if (!res.ok || !res.body) {
                    let msg = `Request failed (${res.status})`;
                    try {
                        const data = await res.json();
                        if (data?.error) msg = data.error;
                    } catch {
                        /* ignore */
                    }
                    throw new Error(msg);
                }

                await consumeNDJSONStream<BuilderStreamEvent>(res.body, (ev) => {
                    handleStreamEvent(ev, assistantMsg.id);
                });

                // Stream completed cleanly. Compute the review queue
                // from the snapshot + the turn's accumulated actions so
                // the user can audit / accept / reject each file.
                const snapshot = turnSnapshotsRef.current.get(assistantMsg.id);
                const pending: PendingChange[] = snapshot
                    ? buildPendingChanges(snapshot, turnActionsRef.current)
                    : [];
                if (pending.length === 0) {
                    // Nothing to review — drop the snapshot to keep
                    // memory tidy.
                    turnSnapshotsRef.current.delete(assistantMsg.id);
                }
                updateAssistantMessage(assistantMsg.id, (m) => ({
                    ...m,
                    isStreaming: false,
                    steps: (m.steps ?? []).map((s) =>
                        s.kind === 'milestone' && s.status === 'doing'
                            ? { ...s, status: 'done' }
                            : s,
                    ),
                    review:
                        pending.length > 0
                            ? { pending, total: pending.length }
                            : undefined,
                }));
            } catch (err) {
                // The turn ended early — but the agent may have already
                // applied a few actions before it failed/aborted.
                // Compute a partial review so the user can roll those
                // back if they want, instead of being stranded.
                const snapshot = turnSnapshotsRef.current.get(assistantMsg.id);
                const partial: PendingChange[] = snapshot
                    ? buildPendingChanges(snapshot, turnActionsRef.current)
                    : [];
                if (partial.length === 0) {
                    turnSnapshotsRef.current.delete(assistantMsg.id);
                }
                if ((err as Error)?.name === 'AbortError') {
                    updateAssistantMessage(assistantMsg.id, (m) => ({
                        ...m,
                        isStreaming: false,
                        content: m.content + (m.content ? '\n\n' : '') + '_(stopped)_',
                        review:
                            partial.length > 0
                                ? { pending: partial, total: partial.length }
                                : m.review,
                    }));
                } else {
                    const message = (err as Error)?.message || 'Something went wrong.';
                    setState((s) => ({ ...s, streamError: message }));
                    updateAssistantMessage(assistantMsg.id, (m) => ({
                        ...m,
                        isStreaming: false,
                        errored: true,
                        content: message,
                        review:
                            partial.length > 0
                                ? { pending: partial, total: partial.length }
                                : m.review,
                    }));
                }
            } finally {
                abortRef.current = null;
                turnActionsRef.current = [];
                setState((s) => ({ ...s, isStreaming: false }));
            }

            function handleStreamEvent(ev: BuilderStreamEvent, msgId: string) {
                if (ev.type === 'text') {
                    if (!ev.delta) return;
                    updateAssistantMessage(msgId, (m) => ({
                        ...m,
                        content: m.content + ev.delta,
                    }));
                    return;
                }

                if (ev.type === 'milestone') {
                    setState((s) => {
                        if (!s.workspace) return s;
                        return {
                            ...s,
                            workspace: {
                                ...s.workspace,
                                updatedAt: Date.now(),
                                messages: s.workspace.messages.map((m) => {
                                    if (m.id !== msgId) return m;
                                    const prevSteps = m.steps ?? [];
                                    const closed = prevSteps.map<BuilderStep>((step) =>
                                        step.kind === 'milestone' && step.status === 'doing'
                                            ? { ...step, status: 'done' }
                                            : step,
                                    );
                                    const next: BuilderStep = {
                                        id: genId('s'),
                                        kind: 'milestone',
                                        text: ev.text,
                                        status: 'doing',
                                    };
                                    return { ...m, steps: [...closed, next] };
                                }),
                            },
                        };
                    });
                    return;
                }

                if (ev.type === 'action') {
                    // Record the raw action so we can replay it into a
                    // PendingChange[] once the turn finishes.
                    turnActionsRef.current.push(ev.action);
                    setState((s) => {
                        if (!s.workspace) return s;
                        const newFiles = applyAction(s.workspace.files, ev.action);
                        const activeFile = nextActiveFile(
                            s.workspace.activeFile,
                            newFiles,
                            ev.action,
                        );

                        return {
                            ...s,
                            workspace: {
                                ...s.workspace,
                                files: newFiles,
                                activeFile,
                                updatedAt: Date.now(),
                                messages: s.workspace.messages.map((m) => {
                                    if (m.id !== msgId) return m;
                                    const prevSteps = m.steps ?? [];
                                    const next: BuilderStep = {
                                        id: genId('s'),
                                        kind: 'action',
                                        action: ev.action,
                                        status: 'done',
                                    };
                                    return { ...m, steps: [...prevSteps, next] };
                                }),
                            },
                        };
                    });
                    return;
                }

                if (ev.type === 'read') {
                    // Show the agent's read-tool call in the timeline. The
                    // server fetches the file content and feeds it back into
                    // the next phase; the client just records that it
                    // happened.
                    setState((s) => {
                        if (!s.workspace) return s;
                        return {
                            ...s,
                            workspace: {
                                ...s.workspace,
                                updatedAt: Date.now(),
                                messages: s.workspace.messages.map((m) => {
                                    if (m.id !== msgId) return m;
                                    const prevSteps = m.steps ?? [];
                                    const next: BuilderStep = {
                                        id: genId('s'),
                                        kind: 'read',
                                        path: ev.path,
                                        status: 'done',
                                    };
                                    return { ...m, steps: [...prevSteps, next] };
                                }),
                            },
                        };
                    });
                    return;
                }

                if (ev.type === 'error') {
                    updateAssistantMessage(msgId, (m) => ({
                        ...m,
                        errored: true,
                        content: m.content + (m.content ? '\n\n' : '') + ev.message,
                    }));
                    return;
                }
                // 'done' is implicit — handled by the await returning.
            }
        },
        [state.isStreaming, state.selectedModelId, workspaceId, updateAssistantMessage],
    );

    const sendMessage = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            await runAgent({ newMessageText: trimmed });
        },
        [runAgent],
    );

    const resumePending = useCallback(async () => {
        await runAgent({});
    }, [runAgent]);

    return {
        workspace: state.workspace,
        isLoading: state.isLoading,
        loadError: state.loadError,
        isStreaming: state.isStreaming,
        error: state.streamError,
        selectedModelId: state.selectedModelId,
        setSelectedModelId,
        setActiveFile,
        updateFile,
        deleteFile,
        sendMessage,
        resumePending,
        abort,
        acceptChanges,
        rejectChanges,
    };
}
