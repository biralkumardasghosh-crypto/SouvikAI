/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCachedSessionsPromise } from '@/lib/preload';
import { Message, ChatSession, ChatState, AIModel } from '@/types/chat';
import type { Attachment, AttachmentPayload, MessageAttachment } from '@/types/attachments';
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
    const selectedModelIdRef = useRef<string>('auto');

    // Keep the ref in sync so sendMessage always reads the latest value
    // without needing selectedModelId in its dependency array (which would
    // cause it to be re-created on every model change and risk race conditions).
    selectedModelIdRef.current = selectedModelId;
    const [state, setState] = useState<ChatState>({
        messages: [],
        isLoading: false,
        error: null,
        currentSessionId: null,
    });
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [sessionsLoaded, setSessionsLoaded] = useState(false);
    const [isCurrentSessionArchived, setIsCurrentSessionArchived] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const loadingUserIdRef = useRef<string | null>(null);
    /**
     * The project id to attach to the NEXT lazily-created session.
     * Set via `newChat(projectId)`; consumed (cleared) once `createSessionInDB`
     * uses it so subsequent new chats default back to no project.
     */
    const pendingProjectIdRef = useRef<string | null>(null);

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
                projectId: s.project_id ?? null,
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
                attachments: Array.isArray(m.attachments) ? (m.attachments as MessageAttachment[]) : undefined,
            }));
            setState((prev) => ({ ...prev, messages, currentSessionId: sessionId }));
        }

        // Also fetch whether this session is archived so we can show a banner
        const { data: sessionData } = await (supabase as any)
            .from('chat_sessions')
            .select('is_archived')
            .eq('id', sessionId)
            .single();
        setIsCurrentSessionArchived(sessionData?.is_archived ?? false);
    }, []);

    // Internal: creates a session in the DB. Called by sendMessage on first message.
    const createSessionInDB = useCallback(async (): Promise<string | null> => {
        if (!user) return null;

        // Consume the pending project id (if any). Each "New chat" intent
        // sets this once; the very next session creation picks it up.
        const projectId = pendingProjectIdRef.current;
        pendingProjectIdRef.current = null;

        const insertPayload: { user_id: string; title: string; project_id?: string | null } = {
            user_id: user.id,
            title: 'New Chat',
        };
        if (projectId) insertPayload.project_id = projectId;

        const result: any = await (supabase as any)
            .from('chat_sessions')
            .insert(insertPayload)
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
                projectId: data.project_id ?? null,
            };
            setSessions((prev) => [newSession, ...prev]);
            setState((prev) => ({ ...prev, currentSessionId: data.id }));
            return data.id;
        }
        return null;
    }, [user]);

    // Public: resets the UI to a blank slate and aborts any in-flight stream.
    // The session is created lazily when the first message is sent.
    //
    // Pass `projectId` to attach the next created session to a project — used
    // by the "New chat" button on the project page.
    const newChat = useCallback((projectId?: string | null) => {
        // Cancel the active stream so it stops consuming API quota.
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        pendingProjectIdRef.current = projectId ?? null;
        setState((prev) => ({
            ...prev,
            messages: [],
            currentSessionId: null,
            isLoading: false,
            error: null,
        }));
        setIsCurrentSessionArchived(false);
    }, []);

    const selectSession = useCallback(async (sessionId: string) => {
        await loadMessages(sessionId);
    }, [loadMessages]);

    const sendMessage = useCallback(async (content: string, attachments: Attachment[] = [], tool?: string) => {
        if (!user) return;

        if (content.length > MAX_INPUT_CHARS) {
            setState((prev) => ({
                ...prev,
                error: `Message is too long (${content.length.toLocaleString()} characters). Please keep it under ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
            }));
            return;
        }

        // Slim metadata persisted alongside the message — used to render
        // image previews and document chips inside the bubble. We deliberately
        // drop the full base64 (heavy) and extracted text (already merged into
        // `content` server-side) to keep DB rows lean.
        const messageAttachments: MessageAttachment[] = attachments.map((a) => ({
            kind: a.kind,
            name: a.name,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            thumbnail: a.kind === 'image' ? a.thumbnail || a.base64 : undefined,
        }));

        // Heavy version sent in the API request — full base64 for vision and
        // extracted text for documents.
        const attachmentPayloads: AttachmentPayload[] = attachments.map(({ kind, mimeType, base64, extractedText, name }) => ({
            kind, mimeType, base64, extractedText, name,
        }));

        let sessionId = state.currentSessionId;
        if (!sessionId) {
            sessionId = await createSessionInDB();
            if (!sessionId) return;
        }

        // Add user message — clean content (no emoji prefix); attachments render
        // as real previews via MessageAttachments inside the bubble.
        const userMessage: Message = {
            id: crypto.randomUUID(),
            sessionId,
            userId: user.id,
            role: 'user',
            content,
            createdAt: new Date(),
            attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
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
            attachments: messageAttachments.length > 0 ? messageAttachments : null,
        }).then(({ error }: any) => {
            if (error) console.error('Failed to save message:', error);
        });

        // On the first message, set a quick placeholder title so the sidebar
        // isn't blank. The real AI-generated title replaces it asynchronously
        // once the first response stream finishes.
        const isFirstMessage = state.messages.length === 0;
        if (isFirstMessage) {
            const placeholder = content.slice(0, 40) + (content.length > 40 ? '…' : '');
            setSessions((prev) =>
                prev.map((s) => (s.id === sessionId ? { ...s, title: placeholder } : s))
            );
            // DB write is also fire-and-forget — AI title will overwrite it shortly
            ;(supabase as any).from('chat_sessions').update({ title: placeholder }).eq('id', sessionId)
                .then(({ error }: any) => { if (error) console.error('Failed to set placeholder title:', error); });
        }

        // Create abort controller
        abortControllerRef.current = new AbortController();

        // Add empty assistant message BEFORE the fetch so the
        // "Thinking..." / "Searching..." indicator shows immediately
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
            // ── Compose personalization block from current preferences ────────
            // Read preferences at call-time (not at hook creation) via the hook
            // value which is already reactive. The block is plain English so any
            // model can understand and follow it.
            const p = preferences;
            const lines: string[] = [];

            if (p.toneStyle !== 'default') {
                const toneMap: Record<string, string> = {
                    formal:    'Use a formal, professional tone.',
                    casual:    'Use a casual, conversational tone.',
                    technical: 'Use a precise, technical tone with domain-specific terminology.',
                    friendly:  'Use a friendly, approachable tone.',
                };
                lines.push(toneMap[p.toneStyle] ?? '');
            }
            if (p.warmth !== 'default')       lines.push(p.warmth === 'more'    ? 'Be warm and personal in your responses.' : 'Keep responses professional and impersonal.');
            if (p.enthusiasm !== 'default')   lines.push(p.enthusiasm === 'more' ? 'Be enthusiastic and energetic.' : 'Be measured and understated in tone.');
            if (p.headersAndLists !== 'default') lines.push(p.headersAndLists === 'more' ? 'Use markdown headers and bullet lists generously to structure your answers.' : 'Avoid markdown headers and bullet lists; prefer flowing prose.');
            if (p.emoji !== 'default')        lines.push(p.emoji === 'more'     ? 'Include relevant emoji throughout your responses.' : 'Do not use emoji in your responses.');

            const personalizationBlock = lines.filter(Boolean).join(' ');
            const customSystemPrompt = [
                p.isSystemPromptSafe && p.systemPrompt ? p.systemPrompt : '',
                personalizationBlock,
            ].filter(Boolean).join('\n\n');

            const runCompletion = async (currentTool?: string, currentSearchResults?: any[], currentSearchQuery?: string) => {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        messageId: userMessage.id,
                        content,
                        attachments: attachmentPayloads,
                        model: selectedModelIdRef.current === 'auto' ? 'souvik-ai-1' : selectedModelIdRef.current,
                        systemPrompt: customSystemPrompt,
                        tool: currentTool,
                        searchResults: currentSearchResults,
                        searchResultsQuery: currentSearchQuery,
                    }),
                    signal: abortControllerRef.current?.signal,
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to get response');
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let assistantContent = '';
                let searchIntercepted = false;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    assistantContent += chunk;

                    // ── Client-side Tool Coordination ────────────────────────────────
                    if (currentTool === 'searchWeb' && !currentSearchResults && !searchIntercepted) {
                        if (assistantContent.includes('<search')) {
                            const searchMatch = assistantContent.match(/<search>([\s\S]*?)<\/search>/);
                            if (searchMatch) {
                                searchIntercepted = true;
                                const query = searchMatch[1].trim();
                                
                                // 1. Abort the current stream since we are pivoting to a search
                                await reader.cancel();
                                
                                // 2. Flip UI to "Searching the web..." shimmer and clear the <search> tags
                                setState((prev) => ({
                                    ...prev,
                                    messages: prev.messages.map((m) =>
                                        m.id === assistantId
                                            ? { ...m, content: '', webSearch: { query, status: 'searching', results: [] } }
                                            : m
                                    ),
                                }));

                                // 3. Perform the web search (client coordinates this so Vercel doesn't timeout)
                                try {
                                    const res = await fetch(`/api/tools/web-search?q=${encodeURIComponent(query)}`);
                                    const data = await res.json();
                                    
                                    // 4. Update UI to "done" with source cards
                                    setState((prev) => ({
                                        ...prev,
                                        messages: prev.messages.map((m) =>
                                            m.id === assistantId
                                                ? { ...m, webSearch: { query, status: 'done', results: data.results || [] } }
                                                : m
                                        ),
                                    }));

                                    // 5. Kick off a second request to the model with the search results.
                                    //    Return its final content so the outer caller (and the DB save)
                                    //    use the real answer, not the raw "<search>…</search>" placeholder.
                                    return await runCompletion(undefined, data.results || [], query);
                                } catch (e) {
                                    console.error('[Chat] Search failed, falling back:', e);
                                    return await runCompletion(undefined, [], query);
                                }
                            }
                            // Still streaming the <search> tag, don't show it to the user yet
                            continue;
                        }
                    }

                    // Safety net: strip any <search>…</search> tags the model
                    // may emit on the second pass (after we've already run the
                    // search). Without this, the raw tag leaks into the
                    // visible answer and gets persisted to the DB.
                    const visibleContent = assistantContent.replace(
                        /<search>[\s\S]*?<\/search>/gi,
                        ''
                    );

                    setState((prev) => ({
                        ...prev,
                        messages: prev.messages.map((m) =>
                            m.id === assistantId ? { ...m, content: visibleContent } : m
                        ),
                    }));
                }

                // Return the cleaned content so the DB save and the outer
                // caller never see the placeholder tag.
                return assistantContent.replace(/<search>[\s\S]*?<\/search>/gi, '').trim();
            };

            const finalContent = await runCompletion(tool);

            // Save assistant message using the final accumulated content
            await (supabase as any).from('chat_messages').insert({
                id: assistantId,
                session_id: sessionId,
                user_id: user.id,
                role: 'assistant',
                content: finalContent,
            });



            // ── Generate AI title after the first exchange ────────────────────
            // Fire-and-forget: runs after the stream is fully complete so it
            // never adds latency to the user's first message. The sidebar title
            // updates silently when the response arrives.
            if (isFirstMessage && finalContent) {
                fetch('/api/chat/title', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        userMessage: content,
                        assistantMessage: finalContent
                            // Strip <think>…</think> tags before sending to the title model
                            .replace(/<think>[\s\S]*?<\/think>/gi, '')
                            .trim(),
                    }),
                })
                    .then((res) => res.ok ? res.json() : null)
                    .then((data) => {
                        if (data?.title) {
                            setSessions((prev) =>
                                prev.map((s) =>
                                    s.id === sessionId ? { ...s, title: data.title } : s
                                )
                            );
                        }
                    })
                    .catch(() => { /* title failure is silent */ });
            }

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
    }, [user, state.currentSessionId, state.messages.length, createSessionInDB, preferences]);

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

    /**
     * Rename a chat session. Updates Supabase and the local sessions list
     * optimistically. The trimmed title must be non-empty; otherwise no-op.
     */
    const renameSession = useCallback(async (sessionId: string, title: string) => {
        const trimmed = title.trim();
        if (!trimmed) return;

        // Optimistic local update
        setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
        );

        const { error } = await (supabase as any)
            .from('chat_sessions')
            .update({ title: trimmed })
            .eq('id', sessionId);

        if (error) {
            console.error('Failed to rename session:', error);
        }
    }, []);

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
        isCurrentSessionArchived,
        sendMessage,
        regenerateMessage,
        newChat,
        selectSession,
        deleteSession,
        pinSession,
        archiveSession,
        renameSession,
        abortRequest,
        loadSessions: () => user && loadSessions(user.id),
    };
}
