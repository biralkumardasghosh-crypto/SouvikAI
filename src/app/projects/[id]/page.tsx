/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Folder,
    Loader2,
    Menu,
    MoreHorizontal,
    Pencil,
    Trash2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { createClient } from '@/lib/supabase/client';
import { branchChatSession } from '@/lib/branch-chat';
import { ChatAccentProvider } from '@/components/chat/ChatAccentProvider';
import {
    Sidebar,
    ConfirmModal,
    ProjectModal,
    ChatInput,
    ChatListView,
} from '@/components/chat';
import {
    Button,
    SimpleTooltip,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui';
import type { Project } from '@/types/projects';
import type { ChatSession } from '@/types/chat';
import type { Attachment } from '@/types/attachments';

// sessionStorage key used to hand off a "first message" from the project
// page's empty-state composer to the home page, which actually creates the
// session and starts streaming. Scoping by project id keeps stale payloads
// from leaking between different projects on the same tab.
const PENDING_KEY = (projectId: string) => `souvik:pending-project-msg:${projectId}`;

const supabase = createClient();

interface PendingDeleteChat {
    sessionId: string;
    title: string;
}

export default function ProjectPage() {
    const params = useParams<{ id: string }>();
    const projectId = params?.id;
    const router = useRouter();
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();

    const {
        projects,
        isLoaded: projectsLoaded,
        renameProject,
        deleteProject,
    } = useProjects();

    const [project, setProject] = useState<Project | null>(null);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [chatsLoaded, setChatsLoaded] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [pendingDeleteChat, setPendingDeleteChat] = useState<PendingDeleteChat | null>(null);

    // ── Auth gate ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push('/signin');
    }, [authLoading, isAuthenticated, router]);

    // ── Resolve project metadata from cache, fallback to direct fetch ─────
    useEffect(() => {
        if (!projectId || !user) return;

        const cached = projects.find((p) => p.id === projectId);
        if (cached) {
            setProject(cached);
            setProjectError(null);
            return;
        }

        if (!projectsLoaded) return;

        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();
            if (cancelled) return;
            if (error || !data) {
                setProjectError('Project not found.');
                return;
            }
            const row = data as any;
            setProject({
                id: row.id,
                userId: row.user_id,
                name: row.name,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            });
            setProjectError(null);
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId, user, projects, projectsLoaded]);

    // ── Load FULL chat sessions for the project (incl. pinned/archived) ───
    // ChatListView needs is_pinned and is_archived to render filters and
    // pin indicators correctly, so we select * here instead of just titles.
    const loadChats = useCallback(async () => {
        if (!projectId || !user) return;
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('project_id', projectId)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (!error && data) {
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
            setChats(mapped);
        }
        setChatsLoaded(true);
    }, [projectId, user]);

    useEffect(() => {
        void loadChats();
    }, [loadChats]);

    // ── Project actions ───────────────────────────────────────────────────
    const handleRenameSubmit = useCallback(
        async (name: string) => {
            if (!project) return;
            await renameProject(project.id, name);
            setProject((prev) => (prev ? { ...prev, name } : prev));
        },
        [project, renameProject]
    );

    const handleDeleteProject = useCallback(async () => {
        if (!project) return;
        await deleteProject(project.id);
        router.push('/');
    }, [project, deleteProject, router]);

    // ── New-chat flows ────────────────────────────────────────────────────
    // Bare "New chat" button: hand off to home with project param so the
    // next session lands in this project. The user types their first
    // message in the home composer.
    const handleNewChat = useCallback(() => {
        if (!projectId) return;
        router.push(`/?project=${projectId}`);
    }, [projectId, router]);

    // Empty-state composer: the user types the first message HERE. We
    // serialize the payload (message + attachments + selected tool) into
    // sessionStorage and route to /. The home page picks it up, calls
    // newChat(projectId), and auto-fires sendMessage so the chat starts
    // streaming immediately.
    const handleEmptyStateSubmit = useCallback(
        (message: string, attachments: Attachment[], tool?: string) => {
            if (!projectId) return;
            try {
                sessionStorage.setItem(
                    PENDING_KEY(projectId),
                    JSON.stringify({ message, attachments, tool })
                );
            } catch (err) {
                console.error('Failed to stage pending project message:', err);
            }
            router.push(`/?project=${projectId}`);
        },
        [projectId, router]
    );

    // ── Chat row mutations (used by ChatListView) ─────────────────────────
    const handleOpenChat = useCallback(
        (sessionId: string) => {
            router.push(`/?session=${sessionId}`);
        },
        [router]
    );

    const handleRenameChat = useCallback(async (sessionId: string, title: string) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        setChats((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
        );
        const { error } = await (supabase as any)
            .from('chat_sessions')
            .update({ title: trimmed })
            .eq('id', sessionId);
        if (error) console.error('Rename failed:', error);
    }, []);

    const handleTogglePinChat = useCallback(async (sessionId: string) => {
        let nextPinned = false;
        setChats((prev) =>
            prev.map((s) => {
                if (s.id === sessionId) {
                    nextPinned = !s.isPinned;
                    return { ...s, isPinned: nextPinned };
                }
                return s;
            })
        );
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_pinned: nextPinned })
            .eq('id', sessionId);
    }, []);

    const handleToggleArchiveChat = useCallback(async (sessionId: string) => {
        let nextArchived = false;
        setChats((prev) =>
            prev.map((s) => {
                if (s.id === sessionId) {
                    nextArchived = !s.isArchived;
                    return { ...s, isArchived: nextArchived };
                }
                return s;
            })
        );
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_archived: nextArchived })
            .eq('id', sessionId);
    }, []);

    const handleRequestDeleteChat = useCallback((sessionId: string, title: string) => {
        setPendingDeleteChat({ sessionId, title });
    }, []);

    // Branch a chat in this project. Because branchChatSession copies the
    // source's project_id, the new session stays in the same project. We
    // optimistically prepend it to the local list so the user sees it before
    // they navigate, then route to the home view where the divider renders.
    const handleBranchChat = useCallback(
        async (sessionId: string) => {
            if (!user) return;
            const branched = await branchChatSession(sessionId, user.id);
            if (!branched) return;
            setChats((prev) => [branched, ...prev]);
            router.push(`/?session=${branched.id}`);
        },
        [user, router]
    );

    const handleConfirmDeleteChat = useCallback(async () => {
        if (!pendingDeleteChat) return;
        const { sessionId } = pendingDeleteChat;
        setChats((prev) => prev.filter((c) => c.id !== sessionId));
        setPendingDeleteChat(null);
        const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId);
        if (error) {
            console.error('Failed to delete chat:', error);
            void loadChats();
        }
    }, [pendingDeleteChat, loadChats]);

    // ── Loading & error states ───────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
            </div>
        );
    }
    if (!isAuthenticated) return null;

    if (projectError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-center p-6">
                <Folder className="h-10 w-10 text-foreground-subtle" />
                <h1 className="text-lg font-semibold text-foreground">Project not found</h1>
                <p className="text-sm text-foreground-muted">
                    It may have been deleted or you don&apos;t have access to it.
                </p>
                <Link
                    href="/"
                    className="mt-2 text-sm text-foreground underline-offset-4 hover:underline"
                >
                    Back to chats
                </Link>
            </div>
        );
    }

    const isTrulyEmpty = chatsLoaded && chats.length === 0;

    return (
        <ChatAccentProvider>
            {/* Reuse the same Sidebar so navigation feels identical to the home
                page. Project chats are nested inside a Project entry, so the
                sidebar's chat list intentionally receives an empty array. */}
            <Sidebar
                sessions={[]}
                currentSessionId={null}
                onNewChat={handleNewChat}
                onSearch={() => {
                    /* search is wired on /chats; no-op here */
                }}
                onSelectSession={(id) => router.push(`/?session=${id}`)}
                onDeleteSession={() => {
                    /* unused on this page */
                }}
                onPinSession={() => {
                    /* unused on this page */
                }}
                onArchiveSession={() => {
                    /* unused on this page */
                }}
                isMobileOpen={isSidebarOpen}
                onMobileClose={() => setIsSidebarOpen(false)}
            />

            <div className="flex-1 flex flex-col min-w-0 relative z-10 bg-background">
                {/* Header */}
                <header className="flex items-center justify-between px-2 md:px-3 py-2 border-b border-border-subtle sticky top-0 z-20 bg-background">
                    <div className="flex items-center gap-1 min-w-0">
                        <SimpleTooltip content="Open menu" side="bottom">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="md:hidden h-9 w-9 text-foreground-muted hover:text-foreground hover:bg-surface-2"
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="Open menu"
                            >
                                <Menu className="h-5 w-5" />
                            </Button>
                        </SimpleTooltip>
                        <Link
                            href="/"
                            className="flex items-center gap-2 px-2 h-8 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors text-sm"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Back</span>
                        </Link>
                    </div>

                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-foreground-muted hover:text-foreground hover:bg-surface-2"
                                    aria-label="Project actions"
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-44 bg-popover text-popover-foreground border-border"
                                sideOffset={6}
                            >
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        setRenameOpen(true);
                                    }}
                                    className="cursor-pointer text-[13px]"
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Rename project
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        setDeleteOpen(true);
                                    }}
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-[13px]"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete project
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[1100px] mx-auto px-6 md:px-10 lg:px-14 pt-8 md:pt-10 pb-16">
                        {/* Title row */}
                        <div className="flex items-start gap-3 mb-7">
                            <div className="h-10 w-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
                                <Folder className="h-5 w-5 text-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground text-balance break-words">
                                    {project?.name ?? 'Loading…'}
                                </h1>
                                <p className="mt-1.5 text-[14px] text-foreground-muted leading-relaxed">
                                    {!chatsLoaded
                                        ? 'Loading chats…'
                                        : chats.length === 0
                                            ? 'No chats yet — start your first conversation below.'
                                            : `${chats.length} ${chats.length === 1 ? 'chat' : 'chats'} in this project`}
                                </p>
                            </div>
                        </div>

                        {/* Either the empty-state composer OR the full chat list. */}
                        {!chatsLoaded ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
                            </div>
                        ) : isTrulyEmpty ? (
                            <EmptyComposer
                                onSubmit={handleEmptyStateSubmit}
                                projectName={project?.name ?? 'this project'}
                            />
                        ) : (
                            <ChatListView
                                sessions={chats}
                                loading={false}
                                user={user}
                                onOpen={handleOpenChat}
                                onNewChat={handleNewChat}
                                onRename={handleRenameChat}
                                onTogglePin={handleTogglePinChat}
                                onToggleArchive={handleToggleArchiveChat}
                                onDelete={handleRequestDeleteChat}
                                onBranch={handleBranchChat}
                                showProjectColumn={false}
                                searchPlaceholder="Search chats in this project…"
                                emptyTitle="No chats match your filters"
                                emptySubtitle="Try clearing your search or switching filters."
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Rename project modal */}
            <ProjectModal
                open={renameOpen}
                mode="rename"
                initialName={project?.name ?? ''}
                onClose={() => setRenameOpen(false)}
                onSubmit={handleRenameSubmit}
            />

            {/* Delete project confirmation */}
            <ConfirmModal
                open={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                onConfirm={handleDeleteProject}
                title="Delete project?"
                description={
                    project
                        ? `“${project.name}” will be deleted. Chats inside will be moved back to your main chat list — they won't be deleted.`
                        : ''
                }
                confirmLabel="Delete"
                confirmVariant="danger"
            />

            {/* Delete chat confirmation */}
            <ConfirmModal
                open={pendingDeleteChat !== null}
                onClose={() => setPendingDeleteChat(null)}
                onConfirm={handleConfirmDeleteChat}
                title="Delete chat?"
                description={
                    pendingDeleteChat
                        ? `"${pendingDeleteChat.title}" and all of its messages will be permanently deleted. This action cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                confirmVariant="danger"
            />
        </ChatAccentProvider>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Empty-state composer — the project has zero chats. The user types here and
// the message is handed off to the home page to actually start the session.
// ────────────────────────────────────────────────────────────────────────────

function EmptyComposer({
    onSubmit,
    projectName,
}: {
    onSubmit: (message: string, attachments: Attachment[], tool?: string) => void;
    projectName: string;
}) {
    return (
        <div className="flex flex-col items-center text-center pt-4 pb-2">
            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4">
                <Folder className="h-6 w-6 text-foreground" />
            </div>
            <h2 className="text-[18px] md:text-[20px] font-semibold text-foreground text-balance">
                Start your first chat in {projectName}
            </h2>
            <p className="mt-1.5 text-[13px] text-foreground-muted max-w-md leading-relaxed">
                Type a message below to begin. New chats you create here will live inside
                this project.
            </p>

            <div className="w-full max-w-3xl mt-6 -mx-4 sm:mx-0">
                {/* ChatInput owns the textarea, attachments, tools, and submit
                    button. We override its outer padding via wrapping context
                    (it uses px-4 internally) so it sits flush in the page. */}
                <ChatInput onSend={onSubmit} />
            </div>

            <p className="mt-3 text-[11px] text-foreground-subtle">
                Press <kbd className="font-mono bg-surface-2 border border-border rounded px-1 py-0.5">Enter</kbd> to send.
            </p>
        </div>
    );
}
