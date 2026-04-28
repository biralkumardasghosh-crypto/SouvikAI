'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    BuilderFiles,
    BuilderFileAction,
    BuilderMessage,
    BuilderStep,
    BuilderStreamEvent,
    BuilderWorkspace,
} from '@/types/code';

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

function genId(prefix = 'm'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function applyAction(files: BuilderFiles, action: BuilderFileAction): BuilderFiles {
    if (action.kind === 'delete') {
        if (!(action.path in files)) return files;
        const next = { ...files };
        delete next[action.path];
        return next;
    }
    if (action.kind === 'rename') {
        if (action.from === action.to) return files;
        if (!(action.from in files)) {
            // Source missing — nothing to move. The server will no-op too.
            return files;
        }
        const next = { ...files };
        next[action.to] = next[action.from];
        delete next[action.from];
        return next;
    }
    return { ...files, [action.path]: action.content };
}

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
            try {
                const res = await fetch(`/api/code/workspaces/${workspaceId}`, {
                    cache: 'no-store',
                });
                if (cancelled) return;
                if (!res.ok) {
                    let msg = `Failed to load workspace (${res.status})`;
                    try {
                        const data = await res.json();
                        if (data?.error) msg = data.error;
                    } catch {
                        /* ignore */
                    }
                    setState((s) => ({
                        ...s,
                        isLoading: false,
                        loadError: msg,
                    }));
                    return;
                }
                const data = (await res.json()) as { workspace: BuilderWorkspace };
                if (cancelled) return;
                setState((s) => ({
                    ...s,
                    workspace: data.workspace,
                    isLoading: false,
                    loadError: null,
                }));
            } catch (err) {
                if (cancelled) return;
                setState((s) => ({
                    ...s,
                    isLoading: false,
                    loadError: (err as Error)?.message ?? 'Failed to load workspace',
                }));
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [workspaceId]);

    // Cleanup pending timers on unmount.
    useEffect(() => {
        return () => {
            saveTimersRef.current.forEach((t) => clearTimeout(t));
            saveTimersRef.current.clear();
            if (activeFileTimerRef.current) clearTimeout(activeFileTimerRef.current);
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
                fetch(`/api/code/workspaces/${workspaceId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activeFile: path }),
                }).catch((err) => console.warn('[Builder] save activeFile failed:', err));
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
                fetch(`/api/code/workspaces/${workspaceId}/files`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path, content }),
                }).catch((err) => console.warn('[Builder] save file failed:', err));
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

            try {
                await fetch(`/api/code/workspaces/${workspaceId}/files`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path }),
                });
            } catch (err) {
                console.warn('[Builder] delete file failed:', err);
            }
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
                                ? deriveTitle(userMsg.content)
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

                await consumeStream(res.body, (ev) => {
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

                if (ev.type === 'action') {
                    setState((s) => {
                        if (!s.workspace) return s;
                        const newFiles = applyAction(s.workspace.files, ev.action);
                        let activeFile = s.workspace.activeFile;
                        if (
                            ev.action.kind === 'delete' &&
                            activeFile === ev.action.path
                        ) {
                            const keys = Object.keys(newFiles);
                            activeFile = keys[0] ?? null;
                        } else if (
                            ev.action.kind === 'rename' &&
                            activeFile === ev.action.from
                        ) {
                            // Follow the move so the editor stays focused on
                            // the same logical file.
                            activeFile = ev.action.to;
                        } else if (
                            (ev.action.kind === 'create' || ev.action.kind === 'edit') &&
                            !activeFile
                        ) {
                            activeFile = ev.action.path;
                        }

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
    };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read NDJSON events from a streaming response body. */
async function consumeStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (ev: BuilderStreamEvent) => void,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const ev = JSON.parse(trimmed) as BuilderStreamEvent;
                onEvent(ev);
            } catch {
                // Malformed line — skip, don't tear down the stream.
            }
        }
    }

    const trailing = buffer.trim();
    if (trailing) {
        try {
            onEvent(JSON.parse(trailing) as BuilderStreamEvent);
        } catch {
            /* ignore */
        }
    }
}

function deriveTitle(message: string): string {
    const words = message.split(/\s+/).slice(0, 6).join(' ');
    return words.length > 50 ? words.slice(0, 50) + '…' : words || 'New build';
}
