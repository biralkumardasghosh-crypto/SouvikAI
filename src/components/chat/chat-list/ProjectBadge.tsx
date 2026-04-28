'use client';

import { cn } from '@/lib/utils';

/**
 * Small dot + label badge shown in the "Project" column of each row, and
 * inline on mobile alongside the timestamp.
 */
export function ProjectBadge({
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
