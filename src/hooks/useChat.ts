/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCachedSessionsPromise } from '@/lib/preload';
import { Message, ChatSession, ChatState, AIModel } from '@/types/chat';
import type { Attachment, AttachmentPayload } from '@/types/attachments';
import { useAuth } from './useAuth';
import { useChatPreferences } from './useChatPreferences';

// Singleton client
const supabase = createClient();

/** Hard limit: ~10k tokens at 4 chars/token. Prevents quota bypass via huge inputs. */
const MAX_INPUT_CHARS = 40_000;

export function useChat() {
    const { user } = useAuth();
    const { preferences } = useChatPreferences();
    const [models, setModels] = useState<AIModel[]>([]);
    const [selectedModelId, setSelectedModelId] = useState<string>('auto');
    const [state, setState] = useState<ChatState>({
        messages: [],
        isLoading: false,
        error: null,
        currentSessionId: null,
    });
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [sessionsLoaded, setSessionsLoaded] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const loadingUserIdRef = useRef<string | null>(null);

    const mapSessionData = useCallback((data: any[]): ChatSession[] => {
        return data
            .filter((s) => !s.is_archived)
            .map((s) => ({
                id: s.id,
                userId: s.user_id,
                title: s.title,
                createdAt: new Date(s.created_at),
                updatedAt: new Date(s.updated_at),
                isPinned: s.is_pinned ?? false,
                isArchived: s.is_archived ?? false,
            }))
            .sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return b.updatedAt.getTime() - a.updatedAt.getTime();
            });
    }, []);

    const loadSessions = useCallback(async (userId: string) => {
        // Prevent duplicate loading
        if (loadingUserIdRef.current === userId || sessionsLoaded) return;
        loadingUserIdRef.current = userId;

        try {
            // First check if sessions were preloaded
            const cachedPromise = getCachedSessionsPromise(userId);
            if (cachedPromise) {
                const data = await cachedPromise;
                setSessions(mapSessionData(data));
                setSessionsLoaded(true);
                return;
            }

            // Otherwise fetch directly
            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false });

            if (!error && data) {
                setSessions(mapSessionData(data));
                setSessionsLoaded(true);
            }
        } finally {
            loadingUserIdRef.current = null;
        }
    }, [sessionsLoaded, mapSessionData]);

    const loadMessages = useCallback(async (sessionId: string) => {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (!error && data) {
            const messages: Message[] = (data as any[]).map((m) => ({
                id: m.id,
                sessionId: m.session_id,
                userId: m.user_id,
                role: m.role,
                content: m.content,
                createdAt: new Date(m.created_at),
            }));
            setState((prev) => ({ ...prev, messages, currentSessionId: sessionId }));
        }
    }, []);

    // Internal: creates a session in the DB. Called by sendMessage on first message.
    const createSessionInDB = useCallback(async (): Promise<string | null> => {
        if (!user) return null;

        const result: any = await (supabase as any)
            .from('chat_sessions')
            .insert({ user_id: user.id, title: 'New Chat' })
            .select()
            .single();

        if (!result.error && result.data) {
            const data = result.data;
            const newSession: ChatSession = {
                id: data.id,
                userId: data.user_id,
                title: data.title,
                createdAt: new Date(data.created_at),
                updatedAt: new Date(data.updated_at),
                isPinned: false,
                isArchived: false,
            };
            setSessions((prev) => [newSession, ...prev]);
            setState((prev) => ({ ...prev, currentSessionId: data.id }));
            return data.id;
        }
        return null;
    }, [user]);

    // Public: resets the UI to a blank slate and aborts any in-flight stream.
    // The session is created lazily when the first message is sent.
    const newChat = useCallback(() => {
        // Cancel the active stream so it stops consuming API quota.
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setState((prev) => ({
            ...prev,
            messages: [],
            currentSessionId: null,
            isLoading: false,
            error: null,
        }));
    }, []);

    const selectSession = useCallback(async (sessionId: string) => {
        await loadMessages(sessionId);
    }, [loadMessages]);

    const sendMessage = useCallback(async (content: string, attachments: Attachment[] = []) => {
        if (!user) return;

        if (content.length > MAX_INPUT_CHARS) {
            setState((prev) => ({
                ...prev,
                error: `Message is too long (${content.length.toLocaleString()} characters). Please keep it under ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
            }));
            return;
        }

        // Build a user-visible content string that includes document context
        const docSummary = attachments
            .filter((a) => a.kind === 'document')
            .map((a) => `📄 ${a.name}`)
            .join(', ');
        const imgSummary = attachments
            .filter((a) => a.kind === 'image')
            .map((a) => `🖼️ ${a.name}`)
            .join(', ');
        const attachmentLabel = [imgSummary, docSummary].filter(Boolean).join('  ');
        const displayContent  = attachmentLabel ? `${content}\n\n${attachmentLabel}` : content;

        // Strip heavy base64/text from the displayed message — keep only the label
        const attachmentPayloads: AttachmentPayload[] = attachments.map(({ kind, mimeType, base64, extractedText, name }) => ({
            kind, mimeType, base64, extractedText, name,
        }));

        let sessionId = state.currentSessionId;
        if (!sessionId) {
            sessionId = await createSessionInDB();
            if (!sessionId) return;
        }

        // Add user message — display text includes attachment labels
        const userMessage: Message = {
            id: crypto.randomUUID(),
            sessionId,
            userId: user.id,
            role: 'user',
            content: displayContent,
            createdAt: new Date(),
        };

        setState((prev) => ({
            ...prev,
            messages: [...prev.messages, userMessage],
            isLoading: true,
            error: null,
        }));

        // Save user message (fire and forget to reduce latency)
        (supabase as any).from('chat_messages').insert({
            id: userMessage.id,
            session_id: sessionId,
            user_id: user.id,
            role: 'user',
            content,
        }).then(({ error }: any) => {
            if (error) console.error('Failed to save message:', error);
        });

        // Update session title if first message (fire and forget)
        if (state.messages.length === 0) {
            const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
            setSessions((prev) =>
                prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
            );

            (supabase as any).from('chat_sessions').update({ title }).eq('id', sessionId)
                .then(({ error }: any) => {
                    if (error) console.error('Failed to update title:', error);
                });
        }

        // Create abort controller
        abortControllerRef.current = new AbortController();

        // Add empty assistant message BEFORE the fetch so the
        // "Thinking..." ShinyText indicator shows immediately
        const assistantId = crypto.randomUUID();
        setState((prev) => ({
            ...prev,
            messages: [
                ...prev.messages,
                {
                    id: assistantId,
                    sessionId,
                    userId: user.id,
                    role: 'assistant',
                    content: '',
                    createdAt: new Date(),
                },
            ],
        }));

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    messageId: userMessage.id,
                    content,
                    attachments: attachmentPayloads,
                    model: selectedModelId === 'auto' ? 'souvik-ai-1' : selectedModelId,
                    systemPrompt: preferences.isSystemPromptSafe ? preferences.systemPrompt : '',
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to get response');
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let assistantContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                assistantContent += chunk;

                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((m) =>
                        m.id === assistantId ? { ...m, content: assistantContent } : m
                    ),
                }));
            }

            // Save assistant message
            await (supabase as any).from('chat_messages').insert({
                id: assistantId,
                session_id: sessionId,
                user_id: user.id,
                role: 'assistant',
                content: assistantContent,
            });

            setState((prev) => ({ ...prev, isLoading: false }));
        } catch (error) {
            const errorMessage = (error as Error).name === 'AbortError'
                ? 'Request was cancelled'
                : (error as Error).message;

            setState((prev) => ({
                ...prev,
                isLoading: false,
                messages: prev.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: errorMessage } : m
                ),
            }));

            if ((error as Error).name !== 'AbortError') {
                // Save the error message as an assistant response so it persists in the chat history
                await (supabase as any).from('chat_messages').insert({
                    id: assistantId,
                    session_id: sessionId,
                    user_id: user.id,
                    role: 'assistant',
                    content: errorMessage,
                });
            }
        }
    }, [user, state.currentSessionId, state.messages.length, createSessionInDB]);

    const abortRequest = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    /**
     * Regenerate an assistant response.
     * Finds the user message that immediately preceded `assistantMessageId`,
     * removes the assistant message from state + DB, then re-sends the user
     * content so a fresh streaming response is produced.
     */
    const regenerateMessage = useCallback(async (assistantMessageId: string) => {
        const messages = state.messages;
        const assistantIdx = messages.findIndex((m) => m.id === assistantMessageId);
        if (assistantIdx === -1) return;

        // Find the closest preceding user message
        let userMessage: Message | null = null;
        for (let i = assistantIdx - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                userMessage = messages[i];
                break;
            }
        }
        if (!userMessage) return;

        // Remove the stale assistant message from state and DB (fire-and-forget)
        setState((prev) => ({
            ...prev,
            messages: prev.messages.filter((m) => m.id !== assistantMessageId),
        }));
        (supabase as any)
            .from('chat_messages')
            .delete()
            .eq('id', assistantMessageId)
            .then(({ error }: any) => {
                if (error) console.error('Failed to delete assistant message for regeneration:', error);
            });

        // Re-send the same user content — sendMessage will create a new assistant bubble
        await sendMessage(userMessage.content);
    }, [state.messages, sendMessage]);

    const deleteSession = useCallback(async (sessionId: string) => {
        await supabase.from('chat_sessions').delete().eq('id', sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (state.currentSessionId === sessionId) {
            setState((prev) => ({ ...prev, messages: [], currentSessionId: null }));
        }
    }, [state.currentSessionId]);

    const pinSession = useCallback(async (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;
        const newPinned = !session.isPinned;
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_pinned: newPinned })
            .eq('id', sessionId);
        setSessions((prev) =>
            prev
                .map((s) => s.id === sessionId ? { ...s, isPinned: newPinned } : s)
                .sort((a, b) => {
                    if (a.isPinned && !b.isPinned) return -1;
                    if (!a.isPinned && b.isPinned) return 1;
                    return b.updatedAt.getTime() - a.updatedAt.getTime();
                })
        );
    }, [sessions]);

    const archiveSession = useCallback(async (sessionId: string) => {
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_archived: true })
            .eq('id', sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (state.currentSessionId === sessionId) {
            setState((prev) => ({ ...prev, messages: [], currentSessionId: null }));
        }
    }, [state.currentSessionId]);

    const loadModels = useCallback(async () => {
        try {
            const res = await fetch('/api/models');
            if (res.ok) {
                const data = await res.json();
                setModels(data);
                if (data.length > 0 && !selectedModelId) {
                    setSelectedModelId('auto');
                }
            }
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }, [selectedModelId]);

    // Load sessions when user becomes available
    useEffect(() => {
        if (user && !sessionsLoaded) {
            loadSessions(user.id);
            loadModels();
        }
    }, [user, sessionsLoaded, loadSessions, loadModels]);

    // Reset sessions state when user changes
    useEffect(() => {
        if (!user) {
            setSessions([]);
            setSessionsLoaded(false);
            setState({
                messages: [],
                isLoading: false,
                error: null,
                currentSessionId: null,
            });
        }
    }, [user]);

    return {
        ...state,
        sessions,
        models,
        selectedModelId,
        setSelectedModelId,
        sendMessage,
        regenerateMessage,
        newChat,
        selectSession,
        deleteSession,
        pinSession,
        archiveSession,
        abortRequest,
        loadSessions: () => user && loadSessions(user.id),
    };
}
