'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Plus,
    Search,
    Pin,
    Archive,
    Trash2,
    Pencil,
    MoreHorizontal,
    Check,
    X,
    ArchiveRestore,
    ListFilter,
    ChevronDown,
    Inbox,
    Loader2,
    Menu,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChatSession } from '@/types/chat';
import { ConfirmModal, Sidebar, SearchModal } from '@/components/chat';
import { ChatAccentProvider } from '@/components/chat/ChatAccentProvider';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date-helpers';

const supabase = createClient();

type FilterId = 'all' | 'pinned' | 'archived';
type SortId = 'recent' | 'oldest' | 'az';

interface PendingDelete {
    sessionId: string;
    title: string;
}

const FILTER_LABEL: Record<FilterId, string> = {
    all: 'All chats',
    pinned: 'Pinned',
    archived: 'Archived',
};

const SORT_LABEL: Record<SortId, string> = {
    recent: 'Most recent',
    oldest: 'Oldest first',
    az: 'Title (A–Z)',
};

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function AllChatsPage() {
    const router = useRouter();
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterId>('all');
    const [sort, setSort] = useState<SortId>('recent');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
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
            }));
            setSessions(mapped);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (user) loadAllSessions(user.id);
    }, [user, loadAllSessions]);

    // ── Mutations ──
    const handleRenameStart = useCallback((session: ChatSession) => {
        setRenamingId(session.id);
        setRenameValue(session.title);
    }, []);

    const handleRenameSave = useCallback(async () => {
        if (!renamingId) return;
        const trimmed = renameValue.trim();
        if (!trimmed) {
            setRenamingId(null);
            return;
        }
        setSessions((prev) =>
            prev.map((s) => (s.id === renamingId ? { ...s, title: trimmed } : s))
        );
        setRenamingId(null);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('chat_sessions')
            .update({ title: trimmed })
            .eq('id', renamingId);
        if (error) console.error('Rename failed:', error);
    }, [renamingId, renameValue]);

    const handleRenameCancel = useCallback(() => {
        setRenamingId(null);
        setRenameValue('');
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

    const handleDeleteRequest = useCallback(
        (sessionId: string) => {
            const target = sessions.find((s) => s.id === sessionId);
            if (!target) return;
            setPendingDelete({ sessionId, title: target.title });
        },
        [sessions]
    );

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

    const handleNewChat = useCallback(() => {
        router.push('/');
    }, [router]);

    const handleRenameFromSidebar = useCallback(
        async (sessionId: string, title: string) => {
            const trimmed = title.trim();
            if (!trimmed) return;
            setSessions((prev) =>
                prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('chat_sessions')
                .update({ title: trimmed })
                .eq('id', sessionId);
        },
        []
    );

    // ── Filtering & sorting ──
    const counts = useMemo(
        () => ({
            all: sessions.filter((s) => !s.isArchived).length,
            pinned: sessions.filter((s) => s.isPinned && !s.isArchived).length,
            archived: sessions.filter((s) => s.isArchived).length,
        }),
        [sessions]
    );

    const filtered = useMemo(() => {
        let list = sessions;

        if (filter === 'all') list = list.filter((s) => !s.isArchived);
        else if (filter === 'pinned')
            list = list.filter((s) => s.isPinned && !s.isArchived);
        else if (filter === 'archived') list = list.filter((s) => s.isArchived);

        const q = query.trim().toLowerCase();
        if (q) list = list.filter((s) => s.title.toLowerCase().includes(q));

        const sorted = [...list];
        if (sort === 'recent') {
            sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        } else if (sort === 'oldest') {
            sorted.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        } else if (sort === 'az') {
            sorted.sort((a, b) => a.title.localeCompare(b.title));
        }

        if (filter === 'all') {
            sorted.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return 0;
            });
        }

        return sorted;
    }, [sessions, filter, query, sort]);

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
                onDeleteSession={handleDeleteRequest}
                onPinSession={handleTogglePin}
                onArchiveSession={handleToggleArchive}
                onRenameSession={handleRenameFromSidebar}
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

                        {/* Toolbar */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                            {/* Search */}
                            <div className="relative flex-1">
                                <Search
                                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-subtle pointer-events-none"
                                    strokeWidth={1.5}
                                />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search chats…"
                                    className={cn(
                                        'w-full h-9 pl-9 pr-9 rounded-md text-[14px] text-foreground placeholder:text-foreground-subtle outline-none',
                                        'bg-surface-2 border border-border',
                                        'focus:bg-surface focus:border-ring focus:shadow-[0_0_0_1px_hsl(var(--ring))]',
                                        'transition-[border-color,background-color,box-shadow] duration-150'
                                    )}
                                />
                                {query && (
                                    <button
                                        onClick={() => setQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-sm text-foreground-muted hover:text-foreground hover:bg-surface-3 transition-colors"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <SortMenu sort={sort} onChange={setSort} />
                                <Button
                                    onClick={handleNewChat}
                                    size="default"
                                    className="shrink-0"
                                >
                                    <Plus className="h-4 w-4" strokeWidth={1.75} />
                                    New chat
                                </Button>
                            </div>
                        </div>

                        {/* Filter pill */}
                        <div className="mb-6">
                            <FilterMenu
                                filter={filter}
                                counts={counts}
                                onChange={setFilter}
                            />
                        </div>

                        {/* Column headers */}
                        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_220px_180px] items-center gap-4 px-3 pb-2 border-b border-border text-[11px] font-medium text-foreground-subtle uppercase tracking-[0.12em]">
                            <div>Name</div>
                            <div>Project</div>
                            <div className="text-right">{SORT_LABEL[sort]}</div>
                        </div>

                        {/* List */}
                        <div className="mt-1 divide-y divide-border-subtle">
                            {loading ? (
                                <SkeletonList />
                            ) : filtered.length === 0 ? (
                                <EmptyState
                                    filter={filter}
                                    query={query}
                                    onNewChat={handleNewChat}
                                />
                            ) : (
                                <ul className="flex flex-col divide-y divide-border-subtle">
                                    {filtered.map((session) => (
                                        <ChatRow
                                            key={session.id}
                                            session={session}
                                            user={user}
                                            isRenaming={renamingId === session.id}
                                            renameValue={renameValue}
                                            onRenameValueChange={setRenameValue}
                                            onRenameStart={() => handleRenameStart(session)}
                                            onRenameSave={handleRenameSave}
                                            onRenameCancel={handleRenameCancel}
                                            onOpen={() => handleOpenChat(session.id)}
                                            onTogglePin={() => handleTogglePin(session.id)}
                                            onToggleArchive={() =>
                                                handleToggleArchive(session.id)
                                            }
                                            onDelete={() =>
                                                setPendingDelete({
                                                    sessionId: session.id,
                                                    title: session.title,
                                                })
                                            }
                                        />
                                    ))}
                                </ul>
                            )}
                        </div>
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

// ────────────────────────────────────────────────────────────────────────────
// Filter dropdown
// ────────────────────────────────────────────────────────────────────────────

interface FilterMenuProps {
    filter: FilterId;
    counts: { all: number; pinned: number; archived: number };
    onChange: (f: FilterId) => void;
}

function FilterMenu({ filter, counts, onChange }: FilterMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const options: {
        id: FilterId;
        label: string;
        icon: React.ReactNode;
        count: number;
    }[] = [
            {
                id: 'all',
                label: 'All chats',
                icon: <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />,
                count: counts.all,
            },
            {
                id: 'pinned',
                label: 'Pinned',
                icon: <Pin className="h-3.5 w-3.5" strokeWidth={1.5} />,
                count: counts.pinned,
            },
            {
                id: 'archived',
                label: 'Archived',
                icon: <Archive className="h-3.5 w-3.5" strokeWidth={1.5} />,
                count: counts.archived,
            },
        ];

    const isActive = filter !== 'all';

    return (
        <div className="relative inline-block" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'inline-flex items-center gap-1.5 h-9 pl-3 pr-3 rounded-md text-[13px] font-medium border transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive
                        ? 'bg-surface-3 text-foreground border-border-strong'
                        : 'bg-surface-2 text-foreground border-border hover:bg-surface-3'
                )}
            >
                <ListFilter className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{filter === 'all' ? 'Filter' : FILTER_LABEL[filter]}</span>
                {isActive && (
                    <X
                        className="h-3 w-3 ml-0.5 text-foreground-muted hover:text-foreground"
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange('all');
                        }}
                    />
                )}
            </button>

            {open && (
                <div className="absolute left-0 mt-1.5 min-w-[220px] z-30 bg-popover border border-border rounded-md shadow-overlay py-1 overflow-hidden">
                    {options.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => {
                                onChange(opt.id);
                                setOpen(false);
                            }}
                            className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors',
                                filter === opt.id
                                    ? 'text-foreground bg-surface-2'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-2'
                            )}
                        >
                            <span className="text-foreground-subtle">{opt.icon}</span>
                            <span className="flex-1 text-left">{opt.label}</span>
                            <span className="font-mono text-[11px] text-foreground-subtle tabular-nums">
                                {opt.count}
                            </span>
                            {filter === opt.id && (
                                <Check className="h-3.5 w-3.5 text-foreground" strokeWidth={1.75} />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Sort menu (text-labeled, not hidden behind ...)
// ───────────────────────────────────────────��────────────────────────────────

function SortMenu({
    sort,
    onChange,
}: {
    sort: SortId;
    onChange: (s: SortId) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const options: { id: SortId; label: string }[] = [
        { id: 'recent', label: 'Most recent' },
        { id: 'oldest', label: 'Oldest first' },
        { id: 'az', label: 'Title (A–Z)' },
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[13px] font-medium transition-colors',
                    'bg-surface-2 border border-border text-foreground hover:bg-surface-3',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                )}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <span className="text-foreground-muted">Sort:</span>
                <span>{SORT_LABEL[sort]}</span>
                <ChevronDown className="h-3 w-3 text-foreground-muted" strokeWidth={1.5} />
            </button>
            {open && (
                <div className="absolute right-0 mt-1.5 min-w-[180px] z-30 bg-popover border border-border rounded-md shadow-overlay py-1 overflow-hidden">
                    {options.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => {
                                onChange(opt.id);
                                setOpen(false);
                            }}
                            className={cn(
                                'w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors',
                                sort === opt.id
                                    ? 'text-foreground bg-surface-2'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-2'
                            )}
                        >
                            <span>{opt.label}</span>
                            {sort === opt.id && (
                                <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Chat row
// ────────────────────────────────────────────────────────────────────────────

interface ChatRowProps {
    session: ChatSession;
    user: { email?: string; user_metadata?: { full_name?: string; avatar_url?: string } } | null;
    isRenaming: boolean;
    renameValue: string;
    onRenameValueChange: (v: string) => void;
    onRenameStart: () => void;
    onRenameSave: () => void;
    onRenameCancel: () => void;
    onOpen: () => void;
    onTogglePin: () => void;
    onToggleArchive: () => void;
    onDelete: () => void;
}

function ChatRow({
    session,
    user,
    isRenaming,
    renameValue,
    onRenameValueChange,
    onRenameStart,
    onRenameSave,
    onRenameCancel,
    onOpen,
    onTogglePin,
    onToggleArchive,
    onDelete,
}: ChatRowProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [isRenaming]);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node))
                setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onRenameSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onRenameCancel();
        }
    };

    const initial = (
        user?.user_metadata?.full_name?.[0] ||
        user?.email?.[0] ||
        'U'
    ).toUpperCase();

    const projectLabel = session.isArchived ? 'Archived' : 'Personal';

    return (
        <li className="group">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_220px_180px] items-center gap-3 md:gap-4 px-3 py-3 hover:bg-surface-2 transition-colors">
                {/* Name */}
                <div className="min-w-0">
                    {isRenaming ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                ref={inputRef}
                                value={renameValue}
                                onChange={(e) => onRenameValueChange(e.target.value)}
                                onKeyDown={handleKey}
                                maxLength={120}
                                className="flex-1 min-w-0 h-8 px-2 rounded-md bg-surface border border-border-strong text-[14px] text-foreground outline-none focus:border-ring focus:shadow-[0_0_0_1px_hsl(var(--ring))]"
                            />
                            <button
                                onClick={onRenameSave}
                                className="h-7 w-7 flex items-center justify-center rounded-md bg-foreground text-background transition-colors"
                                aria-label="Save"
                            >
                                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                            <button
                                onClick={onRenameCancel}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-3 transition-colors"
                                aria-label="Cancel"
                            >
                                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={onOpen} className="block w-full text-left">
                            <span className="inline-flex items-center gap-1.5 max-w-full">
                                <span className="text-[14px] text-foreground truncate">
                                    {session.title}
                                </span>
                                {session.isPinned && (
                                    <Pin
                                        className="h-3 w-3 shrink-0 fill-foreground text-foreground"
                                        aria-label="Pinned"
                                        strokeWidth={1.5}
                                    />
                                )}
                            </span>
                            <p className="md:hidden text-[12px] text-foreground-muted mt-0.5 flex items-center gap-2">
                                <ProjectBadge
                                    label={projectLabel}
                                    archived={session.isArchived}
                                />
                                <span aria-hidden>·</span>
                                <span className="font-mono tabular-nums">
                                    {formatRelativeTime(session.updatedAt)}
                                </span>
                            </p>
                        </button>
                    )}
                </div>

                {/* Project (desktop) */}
                <div className="hidden md:flex items-center min-w-0">
                    <ProjectBadge label={projectLabel} archived={session.isArchived} />
                </div>

                {/* Updated + avatar + menu */}
                <div className="flex items-center justify-end gap-2 md:gap-3">
                    <span className="hidden md:inline font-mono text-[12px] text-foreground-muted tabular-nums whitespace-nowrap">
                        {formatRelativeTime(session.updatedAt)}
                    </span>
                    <div
                        className="hidden md:flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 border border-border text-[10px] font-semibold text-foreground"
                        aria-hidden="true"
                    >
                        {initial}
                    </div>

                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((o) => !o);
                            }}
                            className={cn(
                                'h-7 w-7 flex items-center justify-center rounded-md transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                menuOpen
                                    ? 'bg-surface-3 text-foreground opacity-100'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-3 md:opacity-0 md:group-hover:opacity-100'
                            )}
                            aria-label="More actions"
                        >
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-full mt-1 min-w-[180px] z-30 bg-popover border border-border rounded-md shadow-overlay py-1 overflow-hidden">
                                <MenuItem
                                    onClick={() => {
                                        onTogglePin();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Pin className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                    label={session.isPinned ? 'Unpin' : 'Pin'}
                                />
                                <MenuItem
                                    onClick={() => {
                                        onRenameStart();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                    label="Rename"
                                />
                                <MenuItem
                                    onClick={() => {
                                        onToggleArchive();
                                        setMenuOpen(false);
                                    }}
                                    icon={
                                        session.isArchived ? (
                                            <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.5} />
                                        ) : (
                                            <Archive className="h-3.5 w-3.5" strokeWidth={1.5} />
                                        )
                                    }
                                    label={session.isArchived ? 'Unarchive' : 'Archive'}
                                />
                                <div className="my-1 h-px bg-border-subtle" />
                                <MenuItem
                                    onClick={() => {
                                        onDelete();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                    label="Delete"
                                    danger
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
}

function ProjectBadge({
    label,
    archived,
}: {
    label: string;
    archived: boolean;
}) {
    return (
        <span className="inline-flex items-center gap-2 text-[13px] text-foreground-muted min-w-0">
            <span
                aria-hidden
                className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    archived ? 'bg-foreground-subtle' : 'bg-brand'
                )}
            />
            <span className="truncate">{label}</span>
        </span>
    );
}

function MenuItem({
    onClick,
    icon,
    label,
    danger,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors',
                danger
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-2'
            )}
        >
            {icon}
            {label}
        </button>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Empty + skeleton states
// ────────────────────────────────────────────────────────────────────────────

function EmptyState({
    filter,
    query,
    onNewChat,
}: {
    filter: FilterId;
    query: string;
    onNewChat: () => void;
}) {
    let title = 'No chats yet';
    let subtitle = 'Start a new conversation to see it appear here.';

    if (query) {
        title = 'No matching chats';
        subtitle = `No chats found for "${query}". Try a different search.`;
    } else if (filter === 'pinned') {
        title = 'No pinned chats';
        subtitle = 'Pin important conversations to keep them here for quick access.';
    } else if (filter === 'archived') {
        title = 'No archived chats';
        subtitle = 'Archive chats to hide them from your sidebar without deleting them.';
    }

    const showCta = !query && filter !== 'archived';

    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="h-11 w-11 rounded-md bg-surface-2 border border-border flex items-center justify-center mb-4">
                <Inbox className="h-5 w-5 text-foreground-subtle" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-medium text-foreground">{title}</p>
            <p className="text-[13px] text-foreground-muted mt-1.5 max-w-xs leading-relaxed">
                {subtitle}
            </p>
            {showCta && (
                <Button onClick={onNewChat} size="default" className="mt-5">
                    <Plus className="h-4 w-4" strokeWidth={1.75} />
                    Start a new chat
                </Button>
            )}
        </div>
    );
}

function SkeletonList() {
    return (
        <ul className="flex flex-col divide-y divide-border-subtle" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-3 py-3.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_220px_180px] items-center gap-4">
                        <div className="h-3.5 rounded bg-surface-2 animate-pulse" style={{ width: `${60 + (i * 7) % 30}%` }} />
                        <div className="h-3 w-24 rounded bg-surface-2 animate-pulse" />
                        <div className="ml-auto h-3 w-20 rounded bg-surface-2 animate-pulse" />
                    </div>
                </li>
            ))}
        </ul>
    );
}
