'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SORT_LABEL, type ChatListSortId } from './types';

/**
 * Dropdown for the chat list sort order. Mirrors FilterMenu structurally but
 * is simpler — there's no "active" affordance because every option is valid.
 */
export function SortMenu({
    sort,
    onChange,
}: {
    sort: ChatListSortId;
    onChange: (s: ChatListSortId) => void;
}) {
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

    const options: { id: ChatListSortId; label: string }[] = [
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
