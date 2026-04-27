'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, MessageSquare, X } from 'lucide-react';
import { ChatSession } from '@/types/chat';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date-helpers';

interface SearchModalProps {
    open: boolean;
    onClose: () => void;
    sessions: ChatSession[];
    onSelectSession: (sessionId: string) => void;
}

export function SearchModal({ open, onClose, sessions, onSelectSession }: SearchModalProps) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = query.trim()
        ? sessions.filter(s =>
            s.title.toLowerCase().includes(query.toLowerCase())
        )
        : sessions.slice(0, 8); // show recent sessions when empty

    // Reset state when modal opens
    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
            // Focus input after animation frame
            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        }
    }, [open]);

    // Reset active index when results change
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    // Scroll active item into view
    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const active = list.querySelector<HTMLElement>('[data-active="true"]');
        active?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const handleSelect = useCallback(
        (sessionId: string) => {
            onSelectSession(sessionId);
            onClose();
        },
        [onSelectSession, onClose]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const session = filtered[activeIndex];
                if (session) handleSelect(session.id);
            } else if (e.key === 'Escape') {
                onClose();
            }
        },
        [filtered, activeIndex, handleSelect, onClose]
    );

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/60"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed top-[18%] left-1/2 -translate-x-1/2 z-50 w-full max-w-[380px] px-4">
                <div className="bg-popover text-popover-foreground rounded-xl border border-border shadow-overlay overflow-hidden">
                    {/* Search input row */}
                    <div className="flex items-center gap-2 px-3 h-9 border-b border-border-subtle">
                        <Search className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search your chats…"
                            className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-foreground-subtle outline-none"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="text-foreground-muted hover:text-foreground transition-colors"
                                aria-label="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Results */}
                    <div ref={listRef} className="max-h-[280px] overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6 gap-1.5 text-foreground-muted">
                                <MessageSquare className="h-5 w-5 opacity-30" />
                                <p className="text-[11px]">No chats found</p>
                            </div>
                        ) : (
                            <>
                                {!query && (
                                    <div className="px-3 pt-1.5 pb-1 text-[10px] text-foreground-subtle uppercase tracking-wider font-medium">
                                        Recent
                                    </div>
                                )}
                                {filtered.map((session, i) => (
                                    <button
                                        key={session.id}
                                        data-active={i === activeIndex}
                                        onClick={() => handleSelect(session.id)}
                                        onMouseEnter={() => setActiveIndex(i)}
                                        className={cn(
                                            'w-full flex items-center gap-2 px-3 h-8 text-left transition-colors',
                                            i === activeIndex
                                                ? 'bg-surface-2 text-foreground'
                                                : 'text-foreground-muted hover:text-foreground'
                                        )}
                                    >
                                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                                        <p className="flex-1 min-w-0 text-[12.5px] truncate">
                                            {query
                                                ? highlightMatch(session.title, query)
                                                : session.title}
                                        </p>
                                        <span className="text-[10px] text-foreground-subtle shrink-0">
                                            {formatRelativeTime(session.updatedAt)}
                                        </span>
                                    </button>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Footer hint */}
                    <div className="px-3 h-7 border-t border-border-subtle flex items-center gap-3 text-[10px] text-foreground-subtle">
                        <span className="flex items-center gap-1">
                            <kbd className="font-mono bg-surface-2 border border-border rounded px-1">↑↓</kbd>
                            nav
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="font-mono bg-surface-2 border border-border rounded px-1">↵</kbd>
                            open
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="font-mono bg-surface-2 border border-border rounded px-1">Esc</kbd>
                            close
                        </span>
                        <span className="ml-auto">
                            {filtered.length}
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}

/** Wraps matched substring in a <mark> for highlighting */
function highlightMatch(text: string, query: string) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-transparent text-foreground font-semibold">
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </>
    );
}
