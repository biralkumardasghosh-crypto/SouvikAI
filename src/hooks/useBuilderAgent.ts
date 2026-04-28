'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    BuilderFiles,
    BuilderFileAction,
    BuilderMessage,
    BuilderSession,
    BuilderStep,
    BuilderStreamEvent,
} from '@/types/code';
import { cloneBaseTemplate, DEFAULT_ACTIVE_FILE } from '@/lib/code-agent/template';

const SESSION_KEY = (id: string) => `souvik:builder-session:${id}`;
const SCHEMA_VERSION = 1;

interface PersistedSession {
    v: number;
    session: BuilderSession;
}

function loadSession(id: string): BuilderSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(SESSION_KEY(id));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedSession;
        if (parsed.v !== SCHEMA_VERSION) return null;
        return parsed.session;
    } catch {
        return null;
    }
}

function saveSession(session: BuilderSession) {
    if (typeof window === 'undefined') return;
    try {
        const payload: PersistedSession = { v: SCHEMA_VERSION, session };
        sessionStorage.setItem(SESSION_KEY(session.id), JSON.stringify(payload));
    } catch (err) {
        // Quota exceeded or storage disabled — log and move on. The user can
        // keep working in-memory; persistence is best-effort.
        console.warn('[Builder] Failed to persist session:', err);
    }
}

function newSession(id: string): BuilderSession {
    const now = Date.now();
    return {
        id,
        title: 'New project',
        files: cloneBaseTemplate(),
        messages: [],
        activeFile: DEFAULT_ACTIVE_FILE,
        createdAt: now,
        updatedAt: now,
    };
}

function applyAction(files: BuilderFiles, action: BuilderFileAction): BuilderFiles {
    if (action.kind === 'delete') {
        if (!(action.path in files)) return files;
        const next = { ...files };
        delete next[action.path];
        return next;
    }
    return { ...files, [action.path]: action.content };
}

function genId(prefix = 'm'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseBuilderAgentResult {
    session: BuilderSession;
    isStreaming: boolean;
    error: string | null;
    selectedModelId: string;
    setSelectedModelId: (next: string) => void;
    setActiveFile: (path: string | null) => void;
    updateFile: (path: string, content: string) => void;
    sendMessage: (text: string) => Promise<void>;
    abort: () => void;
}

/**
 * Owns one Builder workspace session: the file system, message history, and
 * the streaming agent connection.
 *
 * Persistence is per-tab (sessionStorage) keyed by the session id passed in
 * the URL. Reload-safe within the same tab; closing the tab clears it.
 */
export function useBuilderAgent(sessionId: string): UseBuilderAgentResult {
    const [session, setSession] = useState<BuilderSession>(() => {
        return loadSession(sessionId) ?? newSession(sessionId);
    });
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string>('auto');
    const abortRef = useRef<AbortController | null>(null);

    // Keep the ref version of session in sync so the streaming callback always
    // sees the latest message map without needing to be re-created.
    const sessionRef = useRef(session);
    sessionRef.current = session;

    // Persist after every change.
    useEffect(() => {
        saveSession(session);
    }, [session]);

    // ── State helpers ────────────────────────────────────────────────────────

    const updateAssistantMessage = useCallback(
        (id: string, mutate: (msg: BuilderMessage) => BuilderMessage) => {
            setSession((prev) => ({
                ...prev,
                updatedAt: Date.now(),
                messages: prev.messages.map((m) => (m.id === id ? mutate(m) : m)),
            }));
        },
        [],
    );

    const setActiveFile = useCallback((path: string | null) => {
        setSession((prev) => ({ ...prev, activeFile: path, updatedAt: Date.now() }));
    }, []);

    const updateFile = useCallback((path: string, content: string) => {
        setSession((prev) => ({
            ...prev,
            files: { ...prev.files, [path]: content },
            updatedAt: Date.now(),
        }));
    }, []);

    const abort = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsStreaming(false);
    }, []);

    // ── Streaming send ───────────────────────────────────────────────────────

    const sendMessage = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || isStreaming) return;

            setError(null);

            const userMsg: BuilderMessage = {
                id: genId('u'),
                role: 'user',
                content: trimmed,
                createdAt: Date.now(),
            };
            const assistantMsg: BuilderMessage = {
                id: genId('a'),
                role: 'assistant',
                content: '',
                steps: [],
                isStreaming: true,
                createdAt: Date.now() + 1,
            };

            // Snapshot history (excluding the new user message) for the API
            // call. We send pure role/content pairs — the file map is sent
            // separately so the system prompt can render it.
            const history = sessionRef.current.messages.map((m) => ({
                role: m.role,
                content:
                    m.role === 'assistant' && m.steps && m.steps.length > 0
                        ? renderAssistantTranscript(m)
                        : m.content,
            }));
            const filesSnapshot = sessionRef.current.files;

            setSession((prev) => ({
                ...prev,
                messages: [...prev.messages, userMsg, assistantMsg],
                title: prev.messages.length === 0 ? deriveTitle(trimmed) : prev.title,
                updatedAt: Date.now(),
            }));
            setIsStreaming(true);

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const res = await fetch('/api/code/agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        message: trimmed,
                        history,
                        files: filesSnapshot,
                        model: selectedModelId,
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
                        s.kind === 'milestone' && s.status === 'doing' ? { ...s, status: 'done' } : s,
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
                    setError(message);
                    updateAssistantMessage(assistantMsg.id, (m) => ({
                        ...m,
                        isStreaming: false,
                        errored: true,
                        content: message,
                    }));
                }
            } finally {
                abortRef.current = null;
                setIsStreaming(false);
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
                    setSession((prev) => ({
                        ...prev,
                        updatedAt: Date.now(),
                        messages: prev.messages.map((m) => {
                            if (m.id !== msgId) return m;
                            const prevSteps = m.steps ?? [];
                            // Mark previous active milestone as done.
                            const closed = prevSteps.map<BuilderStep>((s) =>
                                s.kind === 'milestone' && s.status === 'doing'
                                    ? { ...s, status: 'done' }
                                    : s,
                            );
                            const next: BuilderStep = {
                                id: genId('s'),
                                kind: 'milestone',
                                text: ev.text,
                                status: 'doing',
                            };
                            return { ...m, steps: [...closed, next] };
                        }),
                    }));
                    return;
                }

                if (ev.type === 'action') {
                    setSession((prev) => {
                        const newFiles = applyAction(prev.files, ev.action);
                        // If the active file was deleted, fall back to the
                        // first remaining file (or null).
                        let activeFile = prev.activeFile;
                        if (
                            ev.action.kind === 'delete' &&
                            activeFile === ev.action.path
                        ) {
                            const keys = Object.keys(newFiles);
                            activeFile = keys[0] ?? null;
                        } else if (ev.action.kind === 'create' || ev.action.kind === 'edit') {
                            // Auto-open the file the agent just touched, but
                            // only if the user isn't actively viewing another
                            // file (we don't want to yank focus). We do swap
                            // when there's nothing open, otherwise leave it.
                            if (!activeFile) activeFile = ev.action.path;
                        }

                        return {
                            ...prev,
                            files: newFiles,
                            activeFile,
                            updatedAt: Date.now(),
                            messages: prev.messages.map((m) => {
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
        [isStreaming, selectedModelId, sessionId, updateAssistantMessage],
    );

    return {
        session,
        isStreaming,
        error,
        selectedModelId,
        setSelectedModelId,
        setActiveFile,
        updateFile,
        sendMessage,
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
                // Bad line — just skip rather than tear down the whole stream.
            }
        }
    }

    // Final partial line, if any.
    const trailing = buffer.trim();
    if (trailing) {
        try {
            onEvent(JSON.parse(trailing) as BuilderStreamEvent);
        } catch {
            /* ignore */
        }
    }
}

/**
 * Build a compressed transcript of an assistant message that we send back to
 * the model as conversation history. Includes a brief milestone list and
 * action summary instead of the raw token stream — this keeps the context
 * small while preserving meaning.
 */
function renderAssistantTranscript(m: BuilderMessage): string {
    const lines: string[] = [];
    if (m.steps) {
        for (const s of m.steps) {
            if (s.kind === 'milestone') {
                lines.push(`• ${s.text}`);
            } else {
                lines.push(`[${s.action.kind}] ${s.action.path}`);
            }
        }
    }
    if (m.content.trim()) lines.push(m.content.trim());
    return lines.join('\n');
}

function deriveTitle(message: string): string {
    const words = message.split(/\s+/).slice(0, 6).join(' ');
    return words.length > 50 ? words.slice(0, 50) + '…' : words || 'New project';
}
