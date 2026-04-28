/**
 * Shared types and labels used across the ChatListView and its subcomponents.
 */

export type ChatListFilterId = 'all' | 'pinned' | 'archived';
export type ChatListSortId = 'recent' | 'oldest' | 'az';

export const FILTER_LABEL: Record<ChatListFilterId, string> = {
    all: 'All chats',
    pinned: 'Pinned',
    archived: 'Archived',
};

export const SORT_LABEL: Record<ChatListSortId, string> = {
    recent: 'Most recent',
    oldest: 'Oldest first',
    az: 'Title (A–Z)',
};

export interface UserMeta {
    email?: string;
    user_metadata?: { full_name?: string; avatar_url?: string };
}
