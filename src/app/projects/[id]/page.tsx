/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Folder,
    Loader2,
    Menu,
    MessageSquare,
    MoreHorizontal,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { createClient } from '@/lib/supabase/client';
import { ChatAccentProvider } from '@/components/chat/ChatAccentProvider';
import { Sidebar, ConfirmModal, ProjectModal } from '@/components/chat';
import { Button, SimpleTooltip, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/projects';

interface ProjectChat {
    id: string;
    title: string;
    updatedAt: Date;
}

const supabase = createClient();

export default function ProjectPage() {
    const params = useParams<{ id: string }>();
    const projectId = params?.id;
    const router = useRouter();
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();

    const { projects, isLoaded: projectsLoaded, renameProject, deleteProject } = useProjects();

    const [project, setProject] = useState<Project | null>(null);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [chats, setChats] = useState<ProjectChat[]>([]);
    const [chatsLoaded, setChatsLoaded] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null);

    // ── Auth gate ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push('/signin');
    }, [authLoading, isAuthenticated, router]);

    // ── Resolve project metadata from cache, fallback to direct fetch ─────
    useEffect(() => {
        if (!projectId || !user) return;

        // Try the cached list first (instant) before issuing a network call.
        const cached = projects.find((p) => p.id === projectId);
        if (cached) {
            setProject(cached);
            setProjectError(null);
            return;
        }

        // Wait until useProjects has finished loading before declaring "not found".
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
        return () => { cancelled = true; };
    }, [projectId, user, projects, projectsLoaded]);

    // ── Load chats for the project ─────────────────────────────────────────
    const loadChats = useCallback(async () => {
        if (!projectId || !user) return;
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('id, title, updated_at, is_archived')
            .eq('project_id', projectId)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (!error && data) {
            const mapped: ProjectChat[] = (data as any[])
                .filter((s) => !s.is_archived)
                .map((s) => ({
                    id: s.id,
                    title: s.title,
                    updatedAt: new Date(s.updated_at),
                }));
            setChats(mapped);
        }
        setChatsLoaded(true);
    }, [projectId, user]);

    useEffect(() => { void loadChats(); }, [loadChats]);

    // ── Actions ────────────────────────────────────────────────────────────
    const handleNewChat = useCallback(() => {
        if (!projectId) return;
        // Hand off to the home page; it consumes `?project=` and starts a
        // new chat assigned to this project.
        router.push(`/?project=${projectId}`);
    }, [projectId, router]);

    const handleSelectChat = useCallback((chatId: string) => {
        router.push(`/?session=${chatId}`);
    }, [router]);

    const handleRenameSubmit = useCallback(async (name: string) => {
        if (!project) return;
        await renameProject(project.id, name);
        setProject((prev) => (prev ? { ...prev, name } : prev));
    }, [project, renameProject]);

    const handleDeleteProject = useCallback(async () => {
        if (!project) return;
        await deleteProject(project.id);
        router.push('/');
    }, [project, deleteProject, router]);

    const handleDeleteChat = useCallback(async () => {
        if (!pendingDeleteChatId) return;
        const id = pendingDeleteChatId;
        setChats((prev) => prev.filter((c) => c.id !== id));
        setPendingDeleteChatId(null);
        const { error } = await supabase.from('chat_sessions').delete().eq('id', id);
        if (error) {
            console.error('Failed to delete chat:', error);
            void loadChats();
        }
    }, [pendingDeleteChatId, loadChats]);

    const formatRelative = useMemo(() => {
        const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        return (date: Date) => {
            const diffMs = date.getTime() - Date.now();
            const sec = Math.round(diffMs / 1000);
            const min = Math.round(sec / 60);
            const hr = Math.round(min / 60);
            const day = Math.round(hr / 24);
            if (Math.abs(sec) < 60) return fmt.format(sec, 'second');
            if (Math.abs(min) < 60) return fmt.format(min, 'minute');
            if (Math.abs(hr) < 24) return fmt.format(hr, 'hour');
            if (Math.abs(day) < 30) return fmt.format(day, 'day');
            return date.toLocaleDateString();
        };
    }, []);

    // ── Loading & error states ────────────────────────────────────────────
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
                <p className="text-sm text-foreground-muted">It may have been deleted or you don&apos;t have access to it.</p>
                <Link href="/" className="mt-2 text-sm text-foreground underline-offset-4 hover:underline">
                    Back to chats
                </Link>
            </div>
        );
    }

    return (
        <ChatAccentProvider>
            {/*
              Reuse the same Sidebar so navigation feels identical to the
              home page. Project actions (new/rename/delete) live in the
              sidebar already; we pass empty session handlers since chat
              session mutations don't apply on this page.
            */}
            <Sidebar
                sessions={[]}
                currentSessionId={null}
                onNewChat={handleNewChat}
                onSearch={() => { /* search is wired on home; no-op here */ }}
                onSelectSession={(id) => router.push(`/?session=${id}`)}
                onDeleteSession={() => { /* unused on this page */ }}
                onPinSession={() => { /* unused on this page */ }}
                onArchiveSession={() => { /* unused on this page */ }}
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
                            <DropdownMenuContent align="end" className="w-44 bg-popover text-popover-foreground border-border" sideOffset={6}>
                                <DropdownMenuItem
                                    onSelect={(e) => { e.preventDefault(); setRenameOpen(true); }}
                                    className="cursor-pointer text-[13px]"
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Rename project
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={(e) => { e.preventDefault(); setDeleteOpen(true); }}
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
                    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
                        {/* Title row */}
                        <div className="flex items-start gap-3 mb-6">
                            <div className="h-10 w-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
                                <Folder className="h-5 w-5 text-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-foreground text-balance break-words">
                                    {project?.name ?? 'Loading…'}
                                </h1>
                                <p className="text-[13px] text-foreground-muted mt-1">
                                    {chats.length === 0
                                        ? 'No chats yet — start your first conversation.'
                                        : `${chats.length} ${chats.length === 1 ? 'chat' : 'chats'} in this project`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleNewChat}
                                className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                                New chat
                            </button>
                        </div>

                        {/* Mobile new-chat button */}
                        <button
                            type="button"
                            onClick={handleNewChat}
                            className="sm:hidden w-full inline-flex items-center justify-center gap-2 h-10 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors mb-4"
                        >
                            <Plus className="h-4 w-4" />
                            New chat
                        </button>

                        {/* Chat list */}
                        {!chatsLoaded ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
                            </div>
                        ) : chats.length === 0 ? (
                            <button
                                type="button"
                                onClick={handleNewChat}
                                className={cn(
                                    'w-full flex flex-col items-center justify-center gap-2 py-12 rounded-xl',
                                    'border border-dashed border-border text-foreground-muted hover:text-foreground hover:bg-surface-2',
                                    'transition-colors'
                                )}
                            >
                                <MessageSquare className="h-6 w-6" />
                                <span className="text-sm font-medium">Start your first chat in this project</span>
                                <span className="text-[12px] text-foreground-subtle">Click anywhere to begin</span>
                            </button>
                        ) : (
                            <ul className="space-y-1">
                                {chats.map((chat) => (
                                    <li
                                        key={chat.id}
                                        className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
                                        onClick={() => handleSelectChat(chat.id)}
                                    >
                                        <MessageSquare className="h-4 w-4 shrink-0 text-foreground-subtle" />
                                        <span className="flex-1 min-w-0 truncate text-[14px] text-foreground">
                                            {chat.title}
                                        </span>
                                        <span className="text-[11px] text-foreground-subtle shrink-0 hidden sm:inline">
                                            {formatRelative(chat.updatedAt)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPendingDeleteChatId(chat.id);
                                            }}
                                            aria-label="Delete chat"
                                            className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-foreground-subtle hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
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
                open={pendingDeleteChatId !== null}
                onClose={() => setPendingDeleteChatId(null)}
                onConfirm={handleDeleteChat}
                title="Delete chat?"
                description="This chat and all its messages will be permanently deleted. This action cannot be undone."
                confirmLabel="Delete"
                confirmVariant="danger"
            />
        </ChatAccentProvider>
    );
}
