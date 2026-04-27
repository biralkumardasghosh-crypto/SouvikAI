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
    Star,
    Triangle,
    CircleDashed,
    Loader2,
    Menu,
    PanelLeftClose,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChatSession } from '@/types/chat';
import { ConfirmModal, Sidebar, SearchModal } from '@/components/chat';
import { ChatAccentProvider } from '@/components/chat/ChatAccentProvider';
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
    recent: 'Updated',
    oldest: 'Oldest',
    az: 'Title (A-Z)',
};

// ────────────────────────────────────────────────────────────────────────────
// Page component
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

    // ── Load all sessions (including archived; we filter client-side) ──
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
        // Optimistic
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
        else if (filter === 'pinned') list = list.filter((s) => s.isPinned && !s.isArchived);
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

        // Pinned always on top within "all" view
        if (filter === 'all') {
            sorted.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return 0;
            });
        }

        return sorted;
    }, [sessions, filter, query, sort]);

    // Sessions to feed to the Sidebar (sidebar shows non-archived only).
    const sidebarSessions = useMemo(
        () => sessions.filter((s) => !s.isArchived),
        [sessions]
    );

    // ── Render ──
    if (authLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#212121]">
                <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            </div>
        );
    }

    return (
        <ChatAccentProvider>
            {/* Sidebar (kept visible on the chats page) */}
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

            {/* Main area */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
                {/* Compact top bar (mobile sidebar trigger only) */}
                <header className="flex items-center justify-between px-2 md:px-3 py-2 bg-[#212121] sticky top-0 z-20">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="md:hidden h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                        aria-label="Open sidebar"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground/50">
                        <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                    </div>
                </header>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[1100px] mx-auto px-6 md:px-10 lg:px-14 pt-4 md:pt-6 pb-16">
                        {/* Title */}
                        <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-foreground mb-5 md:mb-6">
                            Chats
                        </h1>

                        {/* Search row */}
                        <div className="flex items-stretch gap-2 mb-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search chats..."
                                    className="w-full h-10 pl-10 pr-9 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-white/[0.2] focus:bg-white/[0.05] text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors"
                                />
                                {query && (
                                    <button
                                        onClick={() => setQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            <SortMenu sort={sort} onChange={setSort} />

                            <button
                                onClick={handleNewChat}
                                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-foreground text-[13px] font-medium border border-white/[0.1] transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                                <span>New chat</span>
                            </button>
                        </div>

                        {/* Filter button */}
                        <div className="mb-5">
                            <FilterMenu
                                filter={filter}
                                counts={counts}
                                onChange={setFilter}
                            />
                        </div>

                        {/* Column headers */}
                        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_220px_180px] items-center gap-4 px-3 pb-2 border-b border-white/[0.05] text-[12px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                            <div>Name</div>
                            <div>Project</div>
                            <div className="flex items-center justify-end gap-1">
                                <button
                                    onClick={() =>
                                        setSort((cur) => (cur === 'recent' ? 'oldest' : 'recent'))
                                    }
                                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors uppercase"
                                >
                                    {SORT_LABEL[sort]}
                                    <ChevronDown className="h-3 w-3" />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="mt-1">
                            {loading ? (
                                <div className="py-16 flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <EmptyState filter={filter} query={query} />
                            ) : (
                                <ul className="flex flex-col">
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
                                            onToggleArchive={() => handleToggleArchive(session.id)}
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

            {/* Search modal (triggered from sidebar) */}
            <SearchModal
                open={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                sessions={sidebarSessions}
                onSelectSession={(sessionId) => handleOpenChat(sessionId)}
            />

            {/* Delete confirmation */}
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
// Filter dropdown (single pill button matching the screenshot)
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
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const options: { id: FilterId; label: string; icon: React.ReactNode; count: number }[] = [
        { id: 'all', label: 'All chats', icon: <Inbox className="h-3.5 w-3.5" />, count: counts.all },
        { id: 'pinned', label: 'Pinned', icon: <Pin className="h-3.5 w-3.5 rotate-45" />, count: counts.pinned },
        { id: 'archived', label: 'Archived', icon: <Archive className="h-3.5 w-3.5" />, count: counts.archived },
    ];

    const isActive = filter !== 'all';

    return (
        <div className="relative inline-block" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'inline-flex items-center gap-1.5 h-9 pl-3 pr-3 rounded-lg text-[13px] font-medium border transition-colors',
                    isActive
                        ? 'bg-white/[0.08] text-foreground border-white/[0.15]'
                        : 'bg-white/[0.03] text-foreground border-white/[0.1] hover:bg-white/[0.06]'
                )}
            >
                <ListFilter className="h-3.5 w-3.5" />
                <span>{filter === 'all' ? 'Filter' : FILTER_LABEL[filter]}</span>
                {isActive && <X className="h-3 w-3 ml-0.5 text-muted-foreground" onClick={(e) => { e.stopPropagation(); onChange('all'); }} />}
            </button>

            {open && (
                <div className="absolute left-0 mt-1.5 min-w-[220px] z-30 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-2xl py-1 overflow-hidden">
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
                                    ? 'text-foreground bg-white/[0.06]'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                            )}
                        >
                            <span className="text-muted-foreground/80">{opt.icon}</span>
                            <span className="flex-1 text-left">{opt.label}</span>
                            <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                                {opt.count}
                            </span>
                            {filter === opt.id && <Check className="h-3.5 w-3.5 text-foreground" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Sort menu (the "..." button to the right of the search bar)
// ────────────────────────────────────────────────────────────────────────────
function SortMenu({ sort, onChange }: { sort: SortId; onChange: (s: SortId) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const options: { id: SortId; label: string }[] = [
        { id: 'recent', label: 'Most recent' },
        { id: 'oldest', label: 'Oldest first' },
        { id: 'az', label: 'Title (A-Z)' },
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] border border-white/[0.08] transition-colors"
                title="Sort"
                aria-label="Sort"
            >
                <MoreHorizontal className="h-4 w-4" />
            </button>
            {open && (
                <div className="absolute right-0 mt-1.5 min-w-[170px] z-30 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-2xl py-1 overflow-hidden">
                    <p className="px-3 py-1 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                        Sort by
                    </p>
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
                                    ? 'text-foreground bg-white/[0.06]'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                            )}
                        >
                            <span>{opt.label}</span>
                            {sort === opt.id && <Check className="h-3.5 w-3.5" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Chat row — three-column layout (Name | Project | Updated)
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
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_220px_180px] items-center gap-3 md:gap-4 px-3 py-3 rounded-md hover:bg-white/[0.03] transition-colors">
                {/* Name column */}
                <div className="min-w-0">
                    {isRenaming ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                ref={inputRef}
                                value={renameValue}
                                onChange={(e) => onRenameValueChange(e.target.value)}
                                onKeyDown={handleKey}
                                maxLength={120}
                                className="flex-1 min-w-0 h-8 px-2 rounded-md bg-white/[0.06] border border-white/[0.15] text-[14px] text-foreground outline-none focus:border-white/[0.25]"
                            />
                            <button
                                onClick={onRenameSave}
                                className="h-7 w-7 flex items-center justify-center rounded-md bg-white/[0.08] hover:bg-white/[0.12] text-foreground transition-colors"
                                aria-label="Save"
                            >
                                <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={onRenameCancel}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                                aria-label="Cancel"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={onOpen}
                            className="block w-full text-left"
                        >
                            <span className="inline-flex items-center gap-1.5 max-w-full">
                                <span className="text-[14px] text-foreground truncate">
                                    {session.title}
                                </span>
                                {session.isPinned && (
                                    <Star
                                        className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                                        aria-label="Pinned"
                                    />
                                )}
                            </span>
                            {/* Mobile-only meta: project + time */}
                            <p className="md:hidden text-[12px] text-muted-foreground/70 mt-0.5 flex items-center gap-2">
                                <ProjectBadge label={projectLabel} archived={session.isArchived} />
                                <span>·</span>
                                <span>{formatRelativeTime(session.updatedAt)}</span>
                            </p>
                        </button>
                    )}
                </div>

                {/* Project column (desktop only) */}
                <div className="hidden md:flex items-center min-w-0">
                    <ProjectBadge label={projectLabel} archived={session.isArchived} />
                </div>

                {/* Updated + avatar + menu */}
                <div className="flex items-center justify-end gap-2 md:gap-3">
                    <span className="hidden md:inline text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatRelativeTime(session.updatedAt)}
                    </span>
                    <div
                        className="hidden md:flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] border border-white/[0.1] text-[10px] font-semibold text-foreground"
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
                                menuOpen
                                    ? 'bg-white/[0.1] text-foreground opacity-100'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06] md:opacity-0 md:group-hover:opacity-100'
                            )}
                            aria-label="More actions"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-full mt-1 min-w-[180px] z-30 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-2xl py-1 overflow-hidden">
                                <MenuItem
                                    onClick={() => {
                                        onTogglePin();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Pin className="h-3.5 w-3.5 rotate-45" />}
                                    label={session.isPinned ? 'Unpin' : 'Pin'}
                                />
                                <MenuItem
                                    onClick={() => {
                                        onRenameStart();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Pencil className="h-3.5 w-3.5" />}
                                    label="Rename"
                                />
                                <MenuItem
                                    onClick={() => {
                                        onToggleArchive();
                                        setMenuOpen(false);
                                    }}
                                    icon={
                                        session.isArchived ? (
                                            <ArchiveRestore className="h-3.5 w-3.5" />
                                        ) : (
                                            <Archive className="h-3.5 w-3.5" />
                                        )
                                    }
                                    label={session.isArchived ? 'Unarchive' : 'Archive'}
                                />
                                <div className="my-1 h-px bg-white/[0.08]" />
                                <MenuItem
                                    onClick={() => {
                                        onDelete();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Trash2 className="h-3.5 w-3.5" />}
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

function ProjectBadge({ label, archived }: { label: string; archived: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground min-w-0">
            {archived ? (
                <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            ) : (
                <Triangle
                    className="h-3 w-3 shrink-0 fill-blue-400/80 text-blue-400/80"
                    aria-hidden="true"
                />
            )}
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
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]'
            )}
        >
            {icon}
            {label}
        </button>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────────
function EmptyState({ filter, query }: { filter: FilterId; query: string }) {
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

    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="h-12 w-12 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
                <Inbox className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-[14px] font-medium text-foreground">{title}</p>
            <p className="text-[12.5px] text-muted-foreground/70 mt-1 max-w-xs">{subtitle}</p>
        </div>
    );
}
