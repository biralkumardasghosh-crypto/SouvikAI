'use client';

import { cn } from '@/lib/utils';

/**
 * Loading placeholder mirroring the row layout. Five rows is enough to fill
 * the viewport without inducing layout thrash on first paint.
 */
export function SkeletonList({ showProjectColumn }: { showProjectColumn: boolean }) {
    return (
        <ul className="flex flex-col divide-y divide-border-subtle" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-3 py-3.5">
                    <div
                        className={cn(
                            'grid items-center gap-4',
                            showProjectColumn
                                ? 'grid-cols-[minmax(0,1fr)_220px_180px]'
                                : 'grid-cols-[minmax(0,1fr)_180px]'
                        )}
                    >
                        <div
                            className="h-3.5 rounded bg-surface-2 animate-pulse"
                            style={{ width: `${60 + (i * 7) % 30}%` }}
                        />
                        {showProjectColumn && (
                            <div className="h-3 w-24 rounded bg-surface-2 animate-pulse" />
                        )}
                        <div className="ml-auto h-3 w-20 rounded bg-surface-2 animate-pulse" />
                    </div>
                </li>
            ))}
        </ul>
    );
}
