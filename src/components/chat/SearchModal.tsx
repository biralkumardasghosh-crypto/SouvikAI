'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, MessageSquare, Clock, X } from 'lucide-react';
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
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fadeIn"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-[560px] px-4 animate-slideDown">
                <div className="bg-[#2a2a2a] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                    {/* Search input row */}
                    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search your chats…"
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground bg-white/5 border border-white/10 font-mono">
                            Esc
                        </kbd>
                    </div>

                    {/* Results */}
                    <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
                        {filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                                <MessageSquare className="h-8 w-8 opacity-30" />
                                <p className="text-sm">No chats found for &quot;{query}&quot;</p>
                            </div>
                        ) : (
                            <>
                                {!query && (
                                    <div className="px-4 py-1.5 text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium">
                                        Recent chats
                                    </div>
                                )}
                                {filtered.map((session, i) => (
                                    <button
                                        key={session.id}
                                        data-active={i === activeIndex}
                                        onClick={() => handleSelect(session.id)}
                                        onMouseEnter={() => setActiveIndex(i)}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                                            i === activeIndex
                                                ? 'bg-white/8 text-foreground'
                                                : 'text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm truncate font-medium">
                                                {query
                                                    ? highlightMatch(session.title, query)
                                                    : session.title}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/50 shrink-0">
                                            <Clock className="h-3 w-3" />
                                            {formatRelativeTime(session.updatedAt)}
                                        </div>
                                    </button>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Footer hint */}
                    <div className="px-4 py-2.5 border-t border-white/8 flex items-center gap-4 text-[11px] text-muted-foreground/50">
                        <span className="flex items-center gap-1">
                            <kbd className="font-mono bg-white/5 border border-white/10 rounded px-1">↑↓</kbd>
                            navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="font-mono bg-white/5 border border-white/10 rounded px-1">↵</kbd>
                            open
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="font-mono bg-white/5 border border-white/10 rounded px-1">Esc</kbd>
                            close
                        </span>
                        <span className="ml-auto">
                            {filtered.length} {filtered.length === 1 ? 'chat' : 'chats'}
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
            <mark className="bg-transparent text-white font-semibold">
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </>
    );
}
