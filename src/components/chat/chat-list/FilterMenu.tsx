'use client';

import { useEffect, useRef, useState } from 'react';
import {
    Inbox,
    Pin,
    Archive,
    ListFilter,
    Check,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILTER_LABEL, type ChatListFilterId } from './types';

/**
 * Dropdown that lets the user filter the chat list by visibility (all, pinned,
 * archived). When something other than `all` is active the trigger gets a
 * little inline X to clear the filter without re-opening the menu.
 */
interface FilterMenuProps {
    filter: ChatListFilterId;
    counts: { all: number; pinned: number; archived: number };
    onChange: (f: ChatListFilterId) => void;
}

export function FilterMenu({ filter, counts, onChange }: FilterMenuProps) {
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

    const options: {
        id: ChatListFilterId;
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
