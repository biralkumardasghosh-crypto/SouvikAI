'use client';

/**
 * ChatListView
 * ─────────────────────────────────────────────────────────────────────────
 * Presentational "all chats" view with search, filter, sort and a rich row.
 * Used by both:
 *   - /chats             → the global chat library
 *   - /projects/[id]     → chats inside a project (with the Project column
 *                          hidden via `showProjectColumn={false}`)
 *
 * The component is purely presentational — it receives the session list and
 * mutation handlers as props and never talks to Supabase directly. Local UI
 * state (search query, active filter, sort, in-place rename) lives here. All
 * subcomponents live in `./chat-list/*` so this file stays focused on
 * composition + filtering/sorting logic.
 */

import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ChatSession } from '@/types/chat';
import { FilterMenu } from './chat-list/FilterMenu';
import { SortMenu } from './chat-list/SortMenu';
import { ChatRow } from './chat-list/ChatRow';
import { EmptyState } from './chat-list/EmptyState';
import { SkeletonList } from './chat-list/SkeletonList';
import {
    SORT_LABEL,
    type ChatListFilterId,
    type ChatListSortId,
    type UserMeta,
} from './chat-list/types';

// Re-export for callers that want to type their state with these IDs.
export type { ChatListFilterId, ChatListSortId } from './chat-list/types';

export interface ChatListViewProps {
    sessions: ChatSession[];
    loading: boolean;
    user: UserMeta | null;

    // Actions delegated to the parent.
    onOpen: (sessionId: string) => void;
    onNewChat: () => void;
    onRename: (sessionId: string, newTitle: string) => Promise<void> | void;
    onTogglePin: (sessionId: string) => Promise<void> | void;
    onToggleArchive: (sessionId: string) => Promise<void> | void;
    /** Parent owns the confirm flow; we just hand off the id + current title. */
    onDelete: (sessionId: string, title: string) => void;
    /**
     * Optional. Branch this chat — creates a new session that copies the
     * existing message history. When omitted the menu item is hidden.
     */
    onBranch?: (sessionId: string) => void;

    /** Hide the "Project" column (used on the per-project page). */
    showProjectColumn?: boolean;
    /** Custom button label, e.g. "New chat in project". */
    newChatLabel?: string;
    /** Custom search placeholder. */
    searchPlaceholder?: string;
    /** Override the empty-state copy (no chats at all). */
    emptyTitle?: string;
    /** Override the empty-state subtitle. */
    emptySubtitle?: string;
}

export function ChatListView({
    sessions,
    loading,
    user,
    onOpen,
    onNewChat,
    onRename,
    onTogglePin,
    onToggleArchive,
    onDelete,
    onBranch,
    showProjectColumn = true,
    newChatLabel = 'New chat',
    searchPlaceholder = 'Search chats…',
    emptyTitle,
    emptySubtitle,
}: ChatListViewProps) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<ChatListFilterId>('all');
    const [sort, setSort] = useState<ChatListSortId>('recent');

    // In-place rename state — owned here so each row stays simple.
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const handleRenameStart = (session: ChatSession) => {
        setRenamingId(session.id);
        setRenameValue(session.title);
    };

    const handleRenameSave = async () => {
        if (!renamingId) return;
        const trimmed = renameValue.trim();
        if (!trimmed) {
            setRenamingId(null);
            return;
        }
        await onRename(renamingId, trimmed);
        setRenamingId(null);
    };

    const handleRenameCancel = () => {
        setRenamingId(null);
        setRenameValue('');
    };

    // ── Counts & filtered list ─────────────────────────────────────────────
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

        // In the default view, pin keeps the visual "stick to top" affordance
        // even when the user picks a non-recency sort — matches the sidebar.
        if (filter === 'all') {
            sorted.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return 0;
            });
        }

        return sorted;
    }, [sessions, filter, query, sort]);

    return (
        <>
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
                        placeholder={searchPlaceholder}
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
                    <Button onClick={onNewChat} size="default" className="shrink-0">
                        <Plus className="h-4 w-4" strokeWidth={1.75} />
                        {newChatLabel}
                    </Button>
                </div>
            </div>

            {/* Filter pill */}
            <div className="mb-6">
                <FilterMenu filter={filter} counts={counts} onChange={setFilter} />
            </div>

            {/* Column headers (desktop) */}
            <div
                className={cn(
                    'hidden md:grid items-center gap-4 px-3 pb-2 border-b border-border text-[11px] font-medium text-foreground-subtle uppercase tracking-[0.12em]',
                    showProjectColumn
                        ? 'grid-cols-[minmax(0,1fr)_220px_180px]'
                        : 'grid-cols-[minmax(0,1fr)_180px]'
                )}
            >
                <div>Name</div>
                {showProjectColumn && <div>Project</div>}
                <div className="text-right">{SORT_LABEL[sort]}</div>
            </div>

            {/* List */}
            <div className="mt-1 divide-y divide-border-subtle">
                {loading ? (
                    <SkeletonList showProjectColumn={showProjectColumn} />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        filter={filter}
                        query={query}
                        onNewChat={onNewChat}
                        title={emptyTitle}
                        subtitle={emptySubtitle}
                        newChatLabel={newChatLabel}
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
                                onOpen={() => onOpen(session.id)}
                                onTogglePin={() => onTogglePin(session.id)}
                                onToggleArchive={() => onToggleArchive(session.id)}
                                onDelete={() => onDelete(session.id, session.title)}
                                onBranch={onBranch ? () => onBranch(session.id) : undefined}
                                showProjectColumn={showProjectColumn}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}
