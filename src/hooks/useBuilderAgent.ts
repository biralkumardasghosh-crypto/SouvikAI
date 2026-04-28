'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    BuilderMessage,
    BuilderStep,
    BuilderStreamEvent,
    BuilderWorkspace,
} from '@/types/code';
import { consumeNDJSONStream } from '@/lib/streaming/ndjson';
import {
    applyAction,
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

                // Stream completed cleanly.
                updateAssistantMessage(assistantMsg.id, (m) => ({
                    ...m,
                    isStreaming: false,
                    steps: (m.steps ?? []).map((s) =>
                        s.kind === 'milestone' && s.status === 'doing'
                            ? { ...s, status: 'done' }
                            : s,
                    ),
                }));
            } catch (err) {
                if ((err as Error)?.name === 'AbortError') {
                    updateAssistantMessage(assistantMsg.id, (m) => ({
                        ...m,
                        isStreaming: false,
                        content: m.content + (m.content ? '\n\n' : '') + '_(stopped)_',
                    }));
                } else {
                    const message = (err as Error)?.message || 'Something went wrong.';
                    setState((s) => ({ ...s, streamError: message }));
                    updateAssistantMessage(assistantMsg.id, (m) => ({
                        ...m,
                        isStreaming: false,
                        errored: true,
                        content: message,
                    }));
                }
            } finally {
                abortRef.current = null;
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

                if (ev.type === 'action-start') {
                    // Lightweight "I'm starting to write X" hint: insert a
                    // doing-state action step so the timeline shows progress
                    // while the file body is still streaming. The matching
                    // `action` event will upgrade this same step to `done`
                    // and apply the file change.
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
                                    // Skip if we already have a doing step
                                    // for this exact (kind,path) — defensive
                                    // against a duplicate hint.
                                    const dup = prevSteps.some(
                                        (st) =>
                                            st.kind === 'action' &&
                                            st.status === 'doing' &&
                                            (st.action.kind === ev.kind ||
                                                (ev.kind === 'rename' &&
                                                    st.action.kind === 'rename')) &&
                                            actionPath(st.action) === ev.path,
                                    );
                                    if (dup) return m;
                                    const placeholder: BuilderStep = {
                                        id: genId('s'),
                                        kind: 'action',
                                        action: placeholderAction(ev.kind, ev.path),
                                        status: 'doing',
                                    };
                                    return { ...m, steps: [...prevSteps, placeholder] };
                                }),
                            },
                        };
                    });
                    return;
                }

                if (ev.type === 'action') {
                    setState((s) => {
                        if (!s.workspace) return s;
                        const newFiles = applyAction(s.workspace.files, ev.action);
                        const activeFile = nextActiveFile(
                            s.workspace.activeFile,
                            newFiles,
                            ev.action,
                        );
                        const targetPath = actionPath(ev.action);

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

                                    // Promote the most recent matching
                                    // doing-action placeholder to done with
                                    // the real action payload.
                                    for (let i = prevSteps.length - 1; i >= 0; i--) {
                                        const st = prevSteps[i];
                                        if (
                                            st.kind === 'action' &&
                                            st.status === 'doing' &&
                                            st.action.kind === ev.action.kind &&
                                            actionPath(st.action) === targetPath
                                        ) {
                                            const upgraded: BuilderStep = {
                                                ...st,
                                                action: ev.action,
                                                status: 'done',
                                            };
                                            const nextSteps = prevSteps.slice();
                                            nextSteps[i] = upgraded;
                                            return { ...m, steps: nextSteps };
                                        }
                                    }

                                    // No placeholder existed (e.g. delete /
                                    // rename emitted in self-closing form
                                    // with no action-start hint) — append.
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

                if (ev.type === 'done') {
                    // Unlock the input + stop the streaming caret as soon as
                    // the model is done — don't wait for the server's
                    // post-stream tail (final DB writes + assistant-message
                    // persistence). The connection stays open for those, but
                    // the user-facing UI is already responsive.
                    setState((s) => {
                        if (!s.workspace) return s;
                        return {
                            ...s,
                            isStreaming: false,
                            workspace: {
                                ...s.workspace,
                                updatedAt: Date.now(),
                                messages: s.workspace.messages.map((m) => {
                                    if (m.id !== msgId) return m;
                                    return {
                                        ...m,
                                        isStreaming: false,
                                        steps: (m.steps ?? []).map((st) => {
                                            if (st.kind === 'milestone' && st.status === 'doing') {
                                                return { ...st, status: 'done' as const };
                                            }
                                            // Any straggler doing-action
                                            // placeholders without a matching
                                            // `action` event are flushed to
                                            // done so the timeline doesn't
                                            // shimmer forever.
                                            if (st.kind === 'action' && st.status === 'doing') {
                                                return { ...st, status: 'done' as const };
                                            }
                                            return st;
                                        }),
                                    };
                                }),
                            },
                        };
                    });
                    return;
                }
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
    };
}
