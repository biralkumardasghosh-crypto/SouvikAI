'use client';

import { Inbox, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import type { ChatListFilterId } from './types';

/**
 * Empty-state shown when the filtered list has zero results. Three branches:
 *  - search query active → "no matching chats"
 *  - filter is `pinned` or `archived` → tailored copy
 *  - otherwise → generic "no chats yet" with a call-to-action
 */
export function EmptyState({
    filter,
    query,
    onNewChat,
    title,
    subtitle,
    newChatLabel,
}: {
    filter: ChatListFilterId;
    query: string;
    onNewChat: () => void;
    title?: string;
    subtitle?: string;
    newChatLabel: string;
}) {
    let computedTitle = title ?? 'No chats yet';
    let computedSubtitle = subtitle ?? 'Start a new conversation to see it appear here.';

    if (query) {
        computedTitle = 'No matching chats';
        computedSubtitle = `No chats found for "${query}". Try a different search.`;
    } else if (filter === 'pinned') {
        computedTitle = 'No pinned chats';
        computedSubtitle = 'Pin important conversations to keep them here for quick access.';
    } else if (filter === 'archived') {
        computedTitle = 'No archived chats';
        computedSubtitle = 'Archive chats to hide them from your sidebar without deleting them.';
    }

    const showCta = !query && filter !== 'archived';

    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="h-11 w-11 rounded-md bg-surface-2 border border-border flex items-center justify-center mb-4">
                <Inbox className="h-5 w-5 text-foreground-subtle" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-medium text-foreground">{computedTitle}</p>
            <p className="text-[13px] text-foreground-muted mt-1.5 max-w-xs leading-relaxed">
                {computedSubtitle}
            </p>
            {showCta && (
                <Button onClick={onNewChat} size="default" className="mt-5">
                    <Plus className="h-4 w-4" strokeWidth={1.75} />
                    {newChatLabel}
                </Button>
            )}
        </div>
    );
}
