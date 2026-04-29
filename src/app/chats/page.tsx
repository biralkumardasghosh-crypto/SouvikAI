'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Menu } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { branchChatSession } from '@/lib/branch-chat';
import { useAuth } from '@/hooks/useAuth';
import { ChatSession } from '@/types/chat';
import {
    ConfirmModal,
    Sidebar,
    SearchModal,
    ChatListView,
} from '@/components/chat';
import { ChatAccentProvider } from '@/components/chat/ChatAccentProvider';

const supabase = createClient();

interface PendingDelete {
    sessionId: string;
    title: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────
//
// Loads ALL of the user's chat sessions (including pinned & archived) and
// renders them with the shared ChatListView. Mutation handlers do an
// optimistic local update, then persist to Supabase.

export default function AllChatsPage() {
    const router = useRouter();
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

    // ── Auth gate ──
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push('/signin');
        }
    }, [authLoading, isAuthenticated, router]);

    // ── Load all sessions ──
    const loadAllSessions = useCallback(async (userId: string) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (!error && data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped: ChatSession[] = (data as any[]).map((s) => ({
                id: s.id,
                userId: s.user_id,
                title: s.title || 'Untitled chat',
                createdAt: new Date(s.created_at),
                updatedAt: new Date(s.updated_at),
                isPinned: s.is_pinned ?? false,
                isArchived: s.is_archived ?? false,
                projectId: s.project_id ?? null,
                branchedFromSessionId: s.branched_from_session_id ?? null,
                branchedFromTitle: s.branched_from_title ?? null,
            }));
            setSessions(mapped);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (user) loadAllSessions(user.id);
    }, [user, loadAllSessions]);

    // ── Mutations (optimistic locally, then persist) ──
    const handleRename = useCallback(async (sessionId: string, title: string) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('chat_sessions')
            .update({ title: trimmed })
            .eq('id', sessionId);
        if (error) console.error('Rename failed:', error);
    }, []);

    const handleTogglePin = useCallback(async (sessionId: string) => {
        let newPinned = false;
        setSessions((prev) =>
            prev.map((s) => {
                if (s.id === sessionId) {
                    newPinned = !s.isPinned;
                    return { ...s, isPinned: newPinned };
                }
                return s;
            })
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_pinned: newPinned })
            .eq('id', sessionId);
    }, []);

    const handleToggleArchive = useCallback(async (sessionId: string) => {
        let newArchived = false;
        setSessions((prev) =>
            prev.map((s) => {
                if (s.id === sessionId) {
                    newArchived = !s.isArchived;
                    return { ...s, isArchived: newArchived };
                }
                return s;
            })
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_archived: newArchived })
            .eq('id', sessionId);
    }, []);

    const handleDelete = useCallback((sessionId: string, title: string) => {
        // ChatListView hands off the title; we use it in the confirm copy.
        setPendingDelete({ sessionId, title });
    }, []);

    const handleDeleteConfirm = useCallback(async () => {
        if (!pendingDelete) return;
        const { sessionId } = pendingDelete;
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setPendingDelete(null);
        await supabase.from('chat_sessions').delete().eq('id', sessionId);
    }, [pendingDelete]);

    const handleOpenChat = useCallback(
        (sessionId: string) => {
            router.push(`/?session=${sessionId}`);
        },
        [router]
    );

    // Branch the chat then jump to it in the home view, where the
    // "Branched from <title>" divider renders at the top.
    const handleBranchChat = useCallback(
        async (sessionId: string) => {
            if (!user) return;
            const branched = await branchChatSession(sessionId, user.id);
            if (!branched) return;
            // Optimistically inject the new session at the top so a quick
            // back-navigation still shows it without a refresh.
            setSessions((prev) => [branched, ...prev]);
            router.push(`/?session=${branched.id}`);
        },
        [user, router]
    );

    const handleNewChat = useCallback(() => {
        router.push('/');
    }, [router]);

    const sidebarSessions = useMemo(
        () => sessions.filter((s) => !s.isArchived),
        [sessions]
    );

    // ── Render ──
    if (authLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
            </div>
        );
    }

    return (
        <ChatAccentProvider>
            <Sidebar
                sessions={sidebarSessions}
                currentSessionId={null}
                onNewChat={handleNewChat}
                onSearch={() => setIsSearchModalOpen(true)}
                onSelectSession={(sessionId) => handleOpenChat(sessionId)}
                onDeleteSession={(sessionId) => {
                    const target = sessions.find((s) => s.id === sessionId);
                    if (target) setPendingDelete({ sessionId, title: target.title });
                }}
                onPinSession={handleTogglePin}
                onArchiveSession={handleToggleArchive}
                onRenameSession={handleRename}
                onBranchSession={handleBranchChat}
                onOpenArchivedChat={(sessionId) => handleOpenChat(sessionId)}
                isMobileOpen={isSidebarOpen}
                onMobileClose={() => setIsSidebarOpen(false)}
            />

            {/* Main */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10 bg-background">
                {/* Top bar (mobile sidebar trigger only) */}
                <header className="flex items-center justify-between h-12 px-3 md:px-5 bg-background sticky top-0 z-20 border-b border-border-subtle">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="md:hidden h-8 w-8 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                        aria-label="Open sidebar"
                    >
                        <Menu className="h-4.5 w-4.5" strokeWidth={1.5} />
                    </button>
                    <div className="hidden md:block" />
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[1100px] mx-auto px-6 md:px-10 lg:px-14 pt-8 md:pt-10 pb-16">
                        {/* Title + subtitle */}
                        <div className="mb-7">
                            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground text-balance">
                                Chats
                            </h1>
                            <p className="mt-1.5 text-[14px] text-foreground-muted leading-relaxed">
                                Search, filter, and revisit your conversations.
                            </p>
                        </div>

                        <ChatListView
                            sessions={sessions}
                            loading={loading}
                            user={user}
                            onOpen={handleOpenChat}
                            onNewChat={handleNewChat}
                            onRename={handleRename}
                            onTogglePin={handleTogglePin}
                            onToggleArchive={handleToggleArchive}
                            onDelete={handleDelete}
                            onBranch={handleBranchChat}
                        />
                    </div>
                </div>
            </div>

            <SearchModal
                open={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                sessions={sidebarSessions}
                onSelectSession={(sessionId) => handleOpenChat(sessionId)}
            />

            <ConfirmModal
                open={pendingDelete !== null}
                onClose={() => setPendingDelete(null)}
                onConfirm={handleDeleteConfirm}
                title="Delete chat?"
                description={
                    pendingDelete
                        ? `"${pendingDelete.title}" and all of its messages will be permanently deleted. This action cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                confirmVariant="danger"
            />
        </ChatAccentProvider>
    );
}
