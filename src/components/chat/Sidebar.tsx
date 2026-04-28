'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    Plus,
    MessageSquare,
    Trash2,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    X,
    Search,
    Image as ImageIcon,
    Grid2X2,
    Code2,
    MoreHorizontal,
    Pin,
    Archive,
    Settings,
    LayoutList,
    Pencil,
    GitBranch,
} from 'lucide-react';
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Avatar,
    AvatarFallback,
    SimpleTooltip,
} from '@/components/ui';
import { ChatSession } from '@/types/chat';
import type { Project } from '@/types/projects';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { SettingsModal } from '@/components/chat/settings/SettingsModal';
import { ProjectsSection } from '@/components/chat/ProjectsSection';
import { ProjectModal } from '@/components/chat/ProjectModal';
import { ConfirmModal } from '@/components/chat/ConfirmModal';

interface SidebarProps {
    sessions: ChatSession[];
    currentSessionId: string | null;
    onNewChat: () => void;
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
    onPinSession: (sessionId: string) => void;
    onArchiveSession: (sessionId: string) => void;
    onRenameSession?: (sessionId: string, title: string) => void;
    /** Branch this chat — creates a new session that copies the existing history. */
    onBranchSession?: (sessionId: string) => void;
    onSearch: () => void;
    /** Called when an archived chat is selected from Settings — loads it in the main view. */
    onOpenArchivedChat?: (sessionId: string) => void;
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

// Stays pinned above the scrollable chat list.
const STICKY_NAV_ITEMS = [
    { icon: Plus, label: 'New chat', action: 'new-chat' as const },
    { icon: Search, label: 'Search chats', action: 'search' as const, shortcut: '⌘K' },
];

// Lives inside the scrollable region — scrolls together with the chat list.
const SCROLLABLE_NAV_ITEMS = [
    { icon: ImageIcon, label: 'Images', action: 'images' as const, href: undefined as string | undefined },
    { icon: Grid2X2, label: 'Apps', action: 'apps' as const, href: undefined as string | undefined },
    { icon: Code2, label: 'Forge', action: 'forge' as const, href: '/code' as string | undefined },
];

// ── Group chats by recency ──────────────────────────────────────────────────
type ChatGroup = { label: string; sessions: ChatSession[] };

function groupSessions(sessions: ChatSession[]): ChatGroup[] {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const pinned: ChatSession[] = [];
    const today: ChatSession[] = [];
    const week: ChatSession[] = [];
    const older: ChatSession[] = [];

    for (const s of sessions) {
        if (s.isPinned) {
            pinned.push(s);
            continue;
        }
        const t = new Date(s.updatedAt).getTime();
        const diff = now - t;
        if (diff < DAY) today.push(s);
        else if (diff < 7 * DAY) week.push(s);
        else older.push(s);
    }

    const groups: ChatGroup[] = [];
    if (pinned.length) groups.push({ label: 'Pinned', sessions: pinned });
    if (today.length) groups.push({ label: 'Today', sessions: today });
    if (week.length) groups.push({ label: 'Previous 7 days', sessions: week });
    if (older.length) groups.push({ label: 'Older', sessions: older });
    return groups;
}

interface ChatListItemProps {
    session: ChatSession;
    isActive: boolean;
    onSelect: () => void;
    onPin: () => void;
    onArchive: () => void;
    onDelete: () => void;
    onRename?: (sessionId: string, title: string) => void;
    onBranch?: () => void;
}

function ChatListItem({ session, isActive, onSelect, onPin, onArchive, onDelete, onRename, onBranch }: ChatListItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(session.title);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    useEffect(() => {
        if (isRenaming) {
            requestAnimationFrame(() => {
                renameInputRef.current?.focus();
                renameInputRef.current?.select();
            });
        }
    }, [isRenaming]);

    const openMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
        setMenuOpen(o => !o);
    };

    const startRename = () => {
        setRenameValue(session.title);
        setIsRenaming(true);
    };

    const commitRename = () => {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== session.title && onRename) {
            onRename(session.id, trimmed);
        }
        setIsRenaming(false);
    };

    const cancelRename = () => {
        setRenameValue(session.title);
        setIsRenaming(false);
    };

    return (
        <>
            <div
                className={cn(
                    'group relative flex items-center gap-1.5 pl-2 pr-1 h-8 rounded-md transition-colors duration-150 text-[13px]',
                    isRenaming
                        ? 'bg-surface-3'
                        : isActive
                            ? 'bg-surface-3 text-foreground cursor-pointer'
                            : 'text-foreground-muted hover:bg-surface-2 hover:text-foreground cursor-pointer'
                )}
                onClick={isRenaming ? undefined : onSelect}
            >
                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commitRename();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelRename();
                            }
                        }}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                        maxLength={120}
                        className="flex-1 min-w-0 bg-transparent text-foreground text-[13px] outline-none"
                    />
                ) : (
                    <span className="flex-1 min-w-0 truncate leading-none">{session.title}</span>
                )}

                {!isRenaming && (
                    <SimpleTooltip content="More options" side="top" disabled={menuOpen}>
                        <button
                            ref={btnRef}
                            onClick={openMenu}
                            aria-label="More options"
                            className={cn(
                                'shrink-0 h-6 w-6 flex items-center justify-center rounded transition-all',
                                menuOpen
                                    ? 'bg-surface-3 text-foreground opacity-100'
                                    : 'text-foreground-subtle hover:bg-surface-3 hover:text-foreground opacity-0 group-hover:opacity-100',
                                isActive && 'opacity-100'
                            )}
                        >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                    </SimpleTooltip>
                )}
            </div>

            {menuOpen && (
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                    className="min-w-[160px] bg-popover text-popover-foreground rounded-lg border border-border shadow-overlay py-1"
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); onPin(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                    >
                        <Pin className="h-3.5 w-3.5 rotate-45" />
                        {session.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    {onRename && (
                        <button
                            onClick={(e) => { e.stopPropagation(); startRename(); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                            Rename
                        </button>
                    )}
                    {onBranch && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onBranch(); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                        >
                            <GitBranch className="h-3.5 w-3.5" />
                            Branch
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onArchive(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                    >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                    </button>
                    <div className="my-1 h-px bg-border-subtle" />
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </button>
                </div>
            )}
        </>
    );
}

// ── Brand mark ──────────────────────────────────────────────────────────────
function BrandMark({ withWordmark = true }: { withWordmark?: boolean }) {
    return (
        <div className="flex items-center gap-2 text-foreground">
            <div className="h-6 w-6 rounded-md bg-foreground text-background flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.477 2 2 6.27 2 11.5c0 2.37.93 4.53 2.46 6.14L3 21.75l4.45-1.45A10.1 10.1 0 0 0 12 21c5.523 0 10-4.27 10-9.5S17.523 2 12 2Z" fill="currentColor" />
                </svg>
            </div>
            {withWordmark && (
                <span className="text-[14px] font-semibold tracking-tight">SouvikAI</span>
            )}
        </div>
    );
}

export function Sidebar({
    sessions,
    currentSessionId,
    onNewChat,
    onSelectSession,
    onDeleteSession,
    onPinSession,
    onArchiveSession,
    onRenameSession,
    onBranchSession,
    onSearch,
    onOpenArchivedChat,
    isMobileOpen = false,
    onMobileClose,
}: SidebarProps) {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(244);
    const [isDragging, setIsDragging] = useState(false);

    const goToAllChats = useCallback(() => {
        onMobileClose?.();
        router.push('/chats');
    }, [router, onMobileClose]);
    const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
    const initial = displayName.charAt(0).toUpperCase();

    const MIN_WIDTH = 200;
    const MAX_WIDTH = 420;
    const COLLAPSED_WIDTH = 56;

    // Sessions that belong to a project are listed inside that project's page.
    // The main sidebar list shows only "loose" (top-level) chats so the same
    // chat never appears twice.
    const looseSessions = useMemo(
        () => sessions.filter((s) => !s.projectId),
        [sessions]
    );
    const groups = useMemo(() => groupSessions(looseSessions), [looseSessions]);

    // ── Projects state ──────────────────────────────────────────────────
    const pathname = usePathname();
    const activeProjectId = useMemo(() => {
        const match = pathname?.match(/^\/projects\/([^/]+)/);
        return match ? match[1] : null;
    }, [pathname]);

    const { projects, createProject, renameProject, deleteProject } = useProjects();
    const [createOpen, setCreateOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<Project | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

    const handleSelectProject = useCallback((id: string) => {
        onMobileClose?.();
        router.push(`/projects/${id}`);
    }, [router, onMobileClose]);

    const handleCreateSubmit = useCallback(async (name: string) => {
        const project = await createProject(name);
        if (project) {
            // Drop the user straight into their new (empty) project.
            router.push(`/projects/${project.id}`);
            onMobileClose?.();
        }
    }, [createProject, router, onMobileClose]);

    const handleRenameSubmit = useCallback(async (name: string) => {
        if (renameTarget) await renameProject(renameTarget.id, name);
    }, [renameTarget, renameProject]);

    const handleDeleteConfirm = useCallback(() => {
        if (!deleteTarget) return;
        const id = deleteTarget.id;
        // If we're currently viewing the project being deleted, navigate home.
        if (activeProjectId === id) router.push('/');
        void deleteProject(id);
    }, [deleteTarget, deleteProject, activeProjectId, router]);

    const startDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        const startX = e.clientX;
        const startWidth = sidebarWidth;

        const onMouseMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta)));
        };
        const onMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [sidebarWidth]);

    return (
        <>
            {/* ── Mobile overlay ── */}
            {isMobileOpen && (
                <div className="sidebar-overlay md:hidden" onClick={onMobileClose} />
            )}

            {/* ── Mobile sidebar drawer ── */}
            {isMobileOpen && (
                <div className="sidebar-drawer md:hidden w-[256px] bg-surface text-foreground border-r border-border flex flex-col h-full safe-top safe-bottom">
                    <div className="flex items-center justify-between px-3 h-12 border-b border-border-subtle">
                        <BrandMark />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMobileClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <nav className="px-2 py-2 space-y-0.5 shrink-0">
                        {STICKY_NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.action}
                                    onClick={item.action === 'new-chat' ? onNewChat : item.action === 'search' ? onSearch : undefined}
                                    className="w-full flex items-center gap-2.5 px-2 h-9 rounded-md text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="flex-1 text-left">{item.label}</span>
                                    {item.shortcut && (
                                        <kbd className="text-[10px] font-mono text-foreground-subtle bg-surface-2 border border-border rounded px-1 py-0.5">
                                            {item.shortcut}
                                        </kbd>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="h-px bg-border-subtle mx-2" />

                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2">
                        <nav className="space-y-0.5 mb-3">
                            {SCROLLABLE_NAV_ITEMS.map((item) => {
                                const Icon = item.icon;
                                const handleClick = () => {
                                    if (item.href) {
                                        onMobileClose?.();
                                        router.push(item.href);
                                    }
                                };
                                return (
                                    <button
                                        key={item.action}
                                        onClick={handleClick}
                                        className="w-full flex items-center gap-2.5 px-2 h-9 rounded-md text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="flex-1 text-left">{item.label}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        <ProjectsSection
                            projects={projects}
                            activeProjectId={activeProjectId}
                            onCreateProject={() => setCreateOpen(true)}
                            onSelectProject={handleSelectProject}
                            onRenameProject={setRenameTarget}
                            onDeleteProject={setDeleteTarget}
                        />

                        {groups.map((group) => (
                            <div key={group.label} className="mb-3 last:mb-0">
                                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
                                    {group.label}
                                </div>
                                <div className="space-y-0.5">
                                    {group.sessions.map((session) => (
                                        <div
                                            key={session.id}
                                            className={cn(
                                                'flex items-center gap-2 px-2 h-9 rounded-md cursor-pointer transition-colors text-[13px]',
                                                currentSessionId === session.id
                                                    ? 'bg-surface-3 text-foreground'
                                                    : 'hover:bg-surface-2 text-foreground-muted hover:text-foreground'
                                            )}
                                            onClick={() => onSelectSession(session.id)}
                                        >
                                            {session.isPinned ? (
                                                <Pin className="h-3 w-3 shrink-0 text-foreground-subtle rotate-45" />
                                            ) : (
                                                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                                            )}
                                            <span className="flex-1 truncate">{session.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="h-px bg-border-subtle mx-2" />

                    <div className="px-2 py-1.5">
                        <button
                            onClick={goToAllChats}
                            className="w-full flex items-center gap-2.5 px-2 h-9 rounded-md text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                        >
                            <LayoutList className="h-4 w-4 shrink-0" />
                            <span className="flex-1 text-left">View all chats</span>
                        </button>
                    </div>

                    <div className="h-px bg-border-subtle mx-2" />

                    <div className="p-2">
                        <UserMenu
                            user={user}
                            displayName={displayName}
                            initial={initial}
                            collapsed={false}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            onSignOut={() => signOut()}
                        />
                    </div>
                </div>
            )}

            {/* ── Desktop sidebar ── */}
            <div
                className="hidden md:block md:relative md:flex-shrink-0 h-full transition-[width] duration-200 ease-out"
                style={{ width: isCollapsed ? COLLAPSED_WIDTH : sidebarWidth }}
            >
                <div className="flex flex-col w-full h-full bg-surface text-foreground border-r border-border overflow-hidden">

                    {/* ── Header: brand + collapse toggle ── */}
                    <div
                        className={cn(
                            'flex items-center h-12 px-2 shrink-0',
                            isCollapsed ? 'flex-col gap-1.5 h-auto py-2' : 'justify-between'
                        )}
                    >
                        <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'pl-1')}>
                            <BrandMark withWordmark={!isCollapsed} />
                        </div>
                        <SimpleTooltip
                            content={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            side={isCollapsed ? 'right' : 'bottom'}
                        >
                            <button
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                                className="text-foreground-muted hover:text-foreground transition-colors h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-2"
                            >
                                {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                            </button>
                        </SimpleTooltip>
                    </div>

                    {/* ── Sticky primary nav (always pinned above chat list) ── */}
                    <nav className={cn('px-2 space-y-0.5 shrink-0', isCollapsed && 'px-1.5')}>
                        {STICKY_NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const isNewChat = item.action === 'new-chat';
                            const isSearch = item.action === 'search';
                            const handler = isNewChat ? onNewChat : isSearch ? onSearch : undefined;

                            return (
                                <SimpleTooltip
                                    key={item.action}
                                    content={
                                        isSearch ? (
                                            <span className="flex items-center gap-1.5">
                                                {item.label}
                                                <kbd className="text-[10px] font-mono bg-surface-2 border border-border rounded px-1 py-px">⌘K</kbd>
                                            </span>
                                        ) : (
                                            item.label
                                        )
                                    }
                                    side="right"
                                    disabled={!isCollapsed}
                                >
                                    <button
                                        onClick={handler}
                                        aria-label={item.label}
                                        className={cn(
                                            'w-full flex items-center text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors duration-150 rounded-md',
                                            isCollapsed
                                                ? 'h-8 w-8 mx-auto justify-center'
                                                : 'gap-2.5 px-2 h-8'
                                        )}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        {!isCollapsed && (
                                            <>
                                                <span className="flex-1 text-left">{item.label}</span>
                                                {isSearch && (
                                                    <kbd className="text-[10px] font-mono text-foreground-subtle bg-surface-2 border border-border rounded px-1 py-px">
                                                        ⌘K
                                                    </kbd>
                                                )}
                                            </>
                                        )}
                                    </button>
                                </SimpleTooltip>
                            );
                        })}
                    </nav>

                    {/* ── Chats section (scrollable: secondary nav + chat groups) ── */}
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mt-2">
                        {/* Secondary nav scrolls along with the chat list */}
                        <nav
                            className={cn(
                                'space-y-0.5',
                                isCollapsed ? 'px-1.5 pb-2' : 'px-2 pb-2'
                            )}
                        >
                            {SCROLLABLE_NAV_ITEMS.map((item) => {
                                const Icon = item.icon;
                                const handleClick = () => {
                                    if (item.href) router.push(item.href);
                                };
                                return (
                                    <SimpleTooltip
                                        key={item.action}
                                        content={item.label}
                                        side="right"
                                        disabled={!isCollapsed}
                                    >
                                        <button
                                            onClick={handleClick}
                                            aria-label={item.label}
                                            className={cn(
                                                'w-full flex items-center text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors duration-150 rounded-md',
                                                isCollapsed
                                                    ? 'h-8 w-8 mx-auto justify-center'
                                                    : 'gap-2.5 px-2 h-8'
                                            )}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            {!isCollapsed && (
                                                <span className="flex-1 text-left">{item.label}</span>
                                            )}
                                        </button>
                                    </SimpleTooltip>
                                );
                            })}
                        </nav>

                        {!isCollapsed && (
                            <div className="px-2 pb-1">
                                <ProjectsSection
                                    projects={projects}
                                    activeProjectId={activeProjectId}
                                    onCreateProject={() => setCreateOpen(true)}
                                    onSelectProject={handleSelectProject}
                                    onRenameProject={setRenameTarget}
                                    onDeleteProject={setDeleteTarget}
                                />
                            </div>
                        )}

                        {!isCollapsed && groups.length > 0 && (
                            <div className="px-2 pb-2">
                                {groups.map((group) => (
                                    <div key={group.label} className="mb-3 last:mb-1">
                                        <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
                                            {group.label}
                                        </div>
                                        <div className="space-y-px">
                                            {group.sessions.map((session) => (
                                                <ChatListItem
                                                    key={session.id}
                                                    session={session}
                                                    isActive={currentSessionId === session.id}
                                                    onSelect={() => onSelectSession(session.id)}
                                                    onPin={() => onPinSession(session.id)}
                                                    onArchive={() => onArchiveSession(session.id)}
                                                    onDelete={() => onDeleteSession(session.id)}
                                                    onRename={onRenameSession}
                                                    onBranch={onBranchSession ? () => onBranchSession(session.id) : undefined}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!isCollapsed && groups.length === 0 && (
                            <div className="px-4 py-6 text-center">
                                <p className="text-[12px] text-foreground-muted">No chats yet</p>
                                <p className="text-[11px] text-foreground-subtle mt-0.5">Start a new chat to begin</p>
                            </div>
                        )}

                        {isCollapsed && sessions.length > 0 && (
                            <div className="px-1.5 py-1 space-y-1">
                                {sessions.slice(0, 12).map((session) => (
                                    <SimpleTooltip key={session.id} content={session.title} side="right">
                                        <button
                                            aria-label={session.title}
                                            className={cn(
                                                'w-8 h-8 mx-auto flex items-center justify-center rounded-md cursor-pointer transition-colors',
                                                currentSessionId === session.id
                                                    ? 'bg-surface-3 text-foreground'
                                                    : 'hover:bg-surface-2 text-foreground-muted hover:text-foreground'
                                            )}
                                            onClick={() => onSelectSession(session.id)}
                                        >
                                            {session.isPinned ? (
                                                <Pin className="h-3.5 w-3.5 rotate-45" />
                                            ) : (
                                                <MessageSquare className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                    </SimpleTooltip>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── View all chats ── */}
                    <div className={cn('shrink-0 border-t border-border-subtle', isCollapsed ? 'p-1.5' : 'px-2 py-1.5')}>
                        <SimpleTooltip content="View all chats" side="right" disabled={!isCollapsed}>
                            <button
                                onClick={goToAllChats}
                                aria-label="View all chats"
                                className={cn(
                                    'w-full flex items-center text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors duration-150 rounded-md',
                                    isCollapsed
                                        ? 'h-8 w-8 mx-auto justify-center'
                                        : 'gap-2.5 px-2 h-8'
                                )}
                            >
                                <LayoutList className="h-4 w-4 shrink-0" />
                                {!isCollapsed && (
                                    <span className="flex-1 text-left">View all chats</span>
                                )}
                            </button>
                        </SimpleTooltip>
                    </div>

                    {/* ── Footer: user menu ── */}
                    <div className={cn('shrink-0 border-t border-border-subtle', isCollapsed ? 'p-1.5' : 'p-2')}>
                        <UserMenu
                            user={user}
                            displayName={displayName}
                            initial={initial}
                            collapsed={isCollapsed}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            onSignOut={() => signOut()}
                        />
                    </div>
                </div>

                {/* Drag handle */}
                {!isCollapsed && (
                    <SimpleTooltip content="Drag to resize" side="right" disabled={isDragging}>
                        <div
                            onMouseDown={startDrag}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize sidebar"
                            className={cn(
                                'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-40 transition-colors',
                                isDragging ? 'bg-ring/60' : 'hover:bg-ring/30'
                            )}
                        />
                    </SimpleTooltip>
                )}
            </div>

            <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} onOpenArchivedChat={onOpenArchivedChat} />

            {/* Create new project */}
            <ProjectModal
                open={createOpen}
                mode="create"
                onClose={() => setCreateOpen(false)}
                onSubmit={handleCreateSubmit}
            />

            {/* Rename project */}
            <ProjectModal
                open={renameTarget !== null}
                mode="rename"
                initialName={renameTarget?.name ?? ''}
                onClose={() => setRenameTarget(null)}
                onSubmit={handleRenameSubmit}
            />

            {/* Delete project confirmation */}
            <ConfirmModal
                open={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirm}
                title="Delete project?"
                description={
                    deleteTarget
                        ? `“${deleteTarget.name}” will be deleted. Chats inside this project will be moved back to your main chat list — they won't be deleted.`
                        : ''
                }
                confirmLabel="Delete"
                confirmVariant="danger"
            />
        </>
    );
}

// ── User menu (footer) ──────────────────────────────────────────────────────
interface UserMenuProps {
    user: { email?: string; displayName?: string } | null;
    displayName: string;
    initial: string;
    collapsed: boolean;
    onOpenSettings: () => void;
    onSignOut: () => void;
}

function UserMenu({ user, displayName, initial, collapsed, onOpenSettings, onSignOut }: UserMenuProps) {
    return (
        <DropdownMenu>
            <SimpleTooltip
                content={collapsed ? `${displayName} · Account` : 'Account'}
                side="right"
                disabled={!collapsed}
            >
                <DropdownMenuTrigger asChild>
                    <button
                        aria-label="Open account menu"
                        className={cn(
                            'w-full flex items-center rounded-md hover:bg-surface-2 transition-colors text-left',
                            collapsed ? 'h-8 w-8 mx-auto justify-center p-0' : 'gap-2 px-1.5 py-1.5'
                        )}
                    >
                        <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border">
                            <AvatarFallback className="bg-foreground text-background text-[11px] font-semibold">
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium truncate text-foreground leading-tight">{displayName}</p>
                                <p className="text-[11px] text-foreground-muted truncate leading-tight">Free plan</p>
                            </div>
                        )}
                    </button>
                </DropdownMenuTrigger>
            </SimpleTooltip>
            <DropdownMenuContent align="start" className="w-56 bg-popover text-popover-foreground border-border" sideOffset={8}>
                <div className="px-2 py-1.5 text-[11px] text-foreground-muted border-b border-border-subtle mb-1 truncate">
                    {user?.email}
                </div>
                <DropdownMenuItem
                    onSelect={(e) => {
                        e.preventDefault();
                        onOpenSettings();
                    }}
                    className="cursor-pointer text-[13px]"
                >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={onSignOut}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-[13px]"
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
