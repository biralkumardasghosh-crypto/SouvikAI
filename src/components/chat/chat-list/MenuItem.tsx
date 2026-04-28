'use client';

import { cn } from '@/lib/utils';

/**
 * Single row inside any of the chat-list dropdown menus (sort, filter, row
 * actions). Kept here so all three menus look and behave the same way.
 */
export function MenuItem({
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
