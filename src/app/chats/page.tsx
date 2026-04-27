'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Search,
    Plus,
    Pin,
    Archive,
    Trash2,
    Pencil,
    MoreHorizontal,
    Check,
    X,
    Inbox,
    ArchiveRestore,
    MessageSquare,
    SlidersHorizontal,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChatSession } from '@/types/chat';
import { ConfirmModal } from '@/components/chat';
import { cn } from '@/lib/utils';
import { formatRelativeTime, formatChatDate } from '@/utils/date-helpers';
import { Loader2 } from 'lucide-react';

const supabase = createClient();

type FilterId = 'all' | 'pinned' | 'archived';
type SortId = 'recent' | 'oldest' | 'az';

interface PendingDelete {
    sessionId: string;
    title: string;
}

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

    const handleTogglePin = useCallback(async (session: ChatSession) => {
        const newPinned = !session.isPinned;
        setSessions((prev) =>
            prev.map((s) => (s.id === session.id ? { ...s, isPinned: newPinned } : s))
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_pinned: newPinned })
            .eq('id', session.id);
    }, []);

    const handleToggleArchive = useCallback(async (session: ChatSession) => {
        const newArchived = !session.isArchived;
        setSessions((prev) =>
            prev.map((s) => (s.id === session.id ? { ...s, isArchived: newArchived } : s))
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_archived: newArchived })
            .eq('id', session.id);
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

    // ── Filtering & sorting ──
    const counts = useMemo(() => ({
        all: sessions.filter((s) => !s.isArchived).length,
        pinned: sessions.filter((s) => s.isPinned && !s.isArchived).length,
        archived: sessions.filter((s) => s.isArchived).length,
    }), [sessions]);

    const filtered = useMemo(() => {
        let list = sessions;

        // Filter
        if (filter === 'all') list = list.filter((s) => !s.isArchived);
        else if (filter === 'pinned') list = list.filter((s) => s.isPinned && !s.isArchived);
        else if (filter === 'archived') list = list.filter((s) => s.isArchived);

        // Search
        const q = query.trim().toLowerCase();
        if (q) list = list.filter((s) => s.title.toLowerCase().includes(q));

        // Sort
        const sorted = [...list];
        if (sort === 'recent') {
            sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        } else if (sort === 'oldest') {
            sorted.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        } else if (sort === 'az') {
            sorted.sort((a, b) => a.title.localeCompare(b.title));
        }

        // Pinned always on top within "all" view (regardless of sort)
        if (filter === 'all') {
            sorted.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return 0;
            });
        }

        return sorted;
    }, [sessions, filter, query, sort]);

    // ── Render ──
    if (authLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#212121]">
                <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#212121] text-foreground">
            {/* ── Header ── */}
            <header className="sticky top-0 z-20 bg-[#212121]/80 backdrop-blur border-b border-white/[0.06]">
                <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center gap-2">
                    <button
                        onClick={() => router.push('/')}
                        className="h-8 w-8 -ml-1 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        title="Back to chat"
                        aria-label="Back to chat"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h1 className="text-[15px] font-semibold tracking-tight">Your chats</h1>
                    <div className="ml-auto">
                        <button
                            onClick={() => router.push('/')}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-foreground text-[13px] font-medium border border-white/10 transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            New chat
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Main ── */}
            <main className="flex-1 w-full">
                <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
                    {/* Search */}
                    <div className="relative mb-4">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search chats by title…"
                            className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-white/[0.2] focus:bg-white/[0.06] text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                                aria-label="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filter chips + sort */}
                    <div className="flex items-center gap-2 mb-5 flex-wrap">
                        <FilterChip
                            active={filter === 'all'}
                            onClick={() => setFilter('all')}
                            icon={<Inbox className="h-3.5 w-3.5" />}
                            label="All"
                            count={counts.all}
                        />
                        <FilterChip
                            active={filter === 'pinned'}
                            onClick={() => setFilter('pinned')}
                            icon={<Pin className="h-3.5 w-3.5 rotate-45" />}
                            label="Pinned"
                            count={counts.pinned}
                        />
                        <FilterChip
                            active={filter === 'archived'}
                            onClick={() => setFilter('archived')}
                            icon={<Archive className="h-3.5 w-3.5" />}
                            label="Archived"
                            count={counts.archived}
                        />

                        <div className="ml-auto">
                            <SortMenu sort={sort} onChange={setSort} />
                        </div>
                    </div>

                    {/* Results meta */}
                    <div className="flex items-center justify-between mb-2 px-1">
                        <p className="text-[12px] text-muted-foreground/70">
                            {loading
                                ? 'Loading…'
                                : `${filtered.length} ${filtered.length === 1 ? 'chat' : 'chats'}${query ? ` matching "${query}"` : ''}`}
                        </p>
                    </div>

                    {/* List */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        {loading ? (
                            <div className="py-16 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <EmptyState filter={filter} query={query} />
                        ) : (
                            <ul className="divide-y divide-white/[0.05]">
                                {filtered.map((session) => (
                                    <ChatRow
                                        key={session.id}
                                        session={session}
                                        isRenaming={renamingId === session.id}
                                        renameValue={renameValue}
                                        onRenameValueChange={setRenameValue}
                                        onRenameStart={() => handleRenameStart(session)}
                                        onRenameSave={handleRenameSave}
                                        onRenameCancel={handleRenameCancel}
                                        onOpen={() => handleOpenChat(session.id)}
                                        onTogglePin={() => handleTogglePin(session)}
                                        onToggleArchive={() => handleToggleArchive(session)}
                                        onDelete={() =>
                                            setPendingDelete({ sessionId: session.id, title: session.title })
                                        }
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </main>

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
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Filter chip
// ────────────────────────────────────────────────────────────────────────────
interface FilterChipProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    count: number;
}

function FilterChip({ active, onClick, icon, label, count }: FilterChipProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-lg text-[13px] font-medium transition-colors border',
                active
                    ? 'bg-white/[0.1] text-foreground border-white/[0.15]'
                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border-white/[0.08]'
            )}
        >
            {icon}
            <span>{label}</span>
            <span
                className={cn(
                    'ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-semibold',
                    active ? 'bg-white/[0.15] text-foreground' : 'bg-white/[0.06] text-muted-foreground/80'
                )}
            >
                {count}
            </span>
        </button>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Sort menu
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
        { id: 'az', label: 'Title (A–Z)' },
    ];
    const current = options.find((o) => o.id === sort);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-white/[0.08] transition-colors"
            >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{current?.label}</span>
            </button>
            {open && (
                <div className="absolute right-0 mt-1.5 min-w-[160px] z-30 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-2xl py-1 overflow-hidden">
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
                            {opt.label}
                            {sort === opt.id && <Check className="h-3.5 w-3.5" />}
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

    return (
        <li className="group relative">
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                {/* Icon / pin marker */}
                <div
                    className={cn(
                        'h-8 w-8 shrink-0 rounded-lg flex items-center justify-center border',
                        session.isPinned
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            : session.isArchived
                                ? 'bg-white/[0.04] border-white/[0.06] text-muted-foreground/60'
                                : 'bg-white/[0.04] border-white/[0.06] text-muted-foreground'
                    )}
                >
                    {session.isPinned ? (
                        <Pin className="h-3.5 w-3.5 rotate-45" />
                    ) : session.isArchived ? (
                        <Archive className="h-3.5 w-3.5" />
                    ) : (
                        <MessageSquare className="h-3.5 w-3.5" />
                    )}
                </div>

                {/* Title + meta */}
                <div className="flex-1 min-w-0">
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
                                title="Save"
                                aria-label="Save"
                            >
                                <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={onRenameCancel}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                                title="Cancel"
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
                            <p className="text-[14px] font-medium text-foreground truncate">
                                {session.title}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground/70 mt-0.5 flex items-center gap-1.5">
                                <span>Updated {formatRelativeTime(session.updatedAt)}</span>
                                <span className="text-muted-foreground/30">·</span>
                                <span>{formatChatDate(session.updatedAt)}</span>
                            </p>
                        </button>
                    )}
                </div>

                {/* Inline action buttons */}
                {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconButton
                            title={session.isPinned ? 'Unpin' : 'Pin'}
                            onClick={onTogglePin}
                            active={session.isPinned}
                        >
                            <Pin className="h-3.5 w-3.5 rotate-45" />
                        </IconButton>
                        <IconButton title="Rename" onClick={onRenameStart}>
                            <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <div className="relative" ref={menuRef}>
                            <IconButton
                                title="More"
                                onClick={() => setMenuOpen((o) => !o)}
                                active={menuOpen}
                            >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                            </IconButton>
                            {menuOpen && (
                                <div className="absolute right-0 top-full mt-1 min-w-[170px] z-30 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-2xl py-1 overflow-hidden">
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
                )}
            </div>
        </li>
    );
}

function IconButton({
    children,
    onClick,
    title,
    active,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
    active?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            aria-label={title}
            className={cn(
                'h-7 w-7 flex items-center justify-center rounded-md transition-colors',
                active
                    ? 'bg-white/[0.1] text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'
            )}
        >
            {children}
        </button>
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
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="h-12 w-12 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-[14px] font-medium text-foreground">{title}</p>
            <p className="text-[12.5px] text-muted-foreground/70 mt-1 max-w-xs">{subtitle}</p>
        </div>
    );
}
