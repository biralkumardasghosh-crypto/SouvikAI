'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Plus, Clock, Folder, MessageCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date-helpers';
import type { BuilderWorkspaceSummary } from '@/types/code';
import { useProjects } from '@/hooks/useProjects';
import type { Project } from '@/types/projects';

interface CodeSearchModalProps {
    open: boolean;
    onClose: () => void;
    workspaces: BuilderWorkspaceSummary[];
}

type SearchItem =
    | { type: 'action'; id: string; label: string; icon: React.ReactNode; onClick: () => void }
    | { type: 'workspace'; item: BuilderWorkspaceSummary }
    | { type: 'project'; item: Project }
    | { type: 'view-all'; onClick: () => void };

export function CodeSearchModal({ open, onClose, workspaces }: CodeSearchModalProps) {
    const router = useRouter();
    const { projects } = useProjects();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const handleNewChat = useCallback(() => {
        router.push('/code');
        onClose();
    }, [router, onClose]);

    const handleAllRecentChats = useCallback(() => {
        // Just redirect to code home or a specific chats page if it exists
        router.push('/code');
        onClose();
    }, [router, onClose]);

    const handleProjects = useCallback(() => {
        router.push('/projects');
        onClose();
    }, [router, onClose]);

    // Compute items for the list
    const items: SearchItem[] = [];
    
    if (query.trim()) {
        const lowerQuery = query.toLowerCase();
        
        // Match projects
        for (const p of projects) {
            if (p.name.toLowerCase().includes(lowerQuery)) {
                items.push({ type: 'project', item: p });
            }
        }
        
        // Match workspaces
        for (const w of workspaces) {
            if (w.title.toLowerCase().includes(lowerQuery)) {
                items.push({ type: 'workspace', item: w });
            }
        }
    } else {
        // Default empty state matching the reference image
        items.push({ type: 'action', id: 'new-chat', label: 'New Chat', icon: <Plus className="h-4 w-4 shrink-0 text-foreground" />, onClick: handleNewChat });
        items.push({ type: 'action', id: 'all-recent', label: 'All Recent Chats', icon: <Clock className="h-4 w-4 shrink-0 text-foreground" />, onClick: handleAllRecentChats });
        items.push({ type: 'action', id: 'projects', label: 'Projects', icon: <Folder className="h-4 w-4 shrink-0 text-foreground" />, onClick: handleProjects });
        
        // Recent chats (up to 15)
        workspaces.slice(0, 15).forEach(w => items.push({ type: 'workspace', item: w }));
        
        if (workspaces.length > 0) {
            items.push({ type: 'view-all', onClick: handleAllRecentChats });
        }
    }

    // Reset state when modal opens
    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
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
        (item: SearchItem) => {
            if (item.type === 'action' || item.type === 'view-all') {
                item.onClick();
            } else if (item.type === 'project') {
                router.push(`/projects/${item.item.id}`);
                onClose();
            } else if (item.type === 'workspace') {
                router.push(`/code/${item.item.id}`);
                onClose();
            }
        },
        [router, onClose]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = items[activeIndex];
                if (item) handleSelect(item);
            } else if (e.key === 'Escape') {
                onClose();
            }
        },
        [items, activeIndex, handleSelect, onClose]
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
            <div className="fixed top-[18%] left-1/2 -translate-x-1/2 z-50 w-full max-w-[500px] px-4">
                <div className="bg-[#0f0f0f] text-foreground rounded-xl border border-[#222] shadow-2xl overflow-hidden flex flex-col">
                    {/* Search input row */}
                    <div className="flex items-center gap-3 px-4 h-12 border-b border-[#222] shrink-0">
                        <Search className="h-4 w-4 text-foreground-muted shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search across all workspaces..."
                            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-foreground-muted outline-none"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="text-foreground-muted hover:text-foreground transition-colors"
                                aria-label="Clear search"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Results */}
                    <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2 flex flex-col">
                        {items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-foreground-muted">
                                <Search className="h-5 w-5 opacity-30" />
                                <p className="text-[13px]">No results found</p>
                            </div>
                        ) : query.trim() ? (
                            // Flat list when searching
                            items.map((item, i) => (
                                <SearchItemRow 
                                    key={`search-${i}`}
                                    item={item}
                                    index={i}
                                    activeIndex={activeIndex}
                                    query={query}
                                    onSelect={() => handleSelect(item)}
                                    onHover={() => setActiveIndex(i)}
                                />
                            ))
                        ) : (
                            // Grouped list when empty (matching reference)
                            <div className="flex flex-col">
                                {/* Actions group */}
                                <div className="flex flex-col mb-4">
                                    {items.filter(i => i.type === 'action').map((item, i) => (
                                        <SearchItemRow 
                                            key={(item as any).id}
                                            item={item}
                                            index={i}
                                            activeIndex={activeIndex}
                                            query={query}
                                            onSelect={() => handleSelect(item)}
                                            onHover={() => setActiveIndex(i)}
                                        />
                                    ))}
                                </div>
                                
                                {/* Recent Chats group */}
                                {workspaces.length > 0 && (
                                    <div className="flex flex-col">
                                        <div className="px-4 py-2 text-[12px] font-semibold text-foreground-muted">
                                            Recent Chats
                                        </div>
                                        {items.map((item, i) => {
                                            if (item.type === 'workspace' || item.type === 'view-all') {
                                                return (
                                                    <SearchItemRow 
                                                        key={`recent-${i}`}
                                                        item={item}
                                                        index={i}
                                                        activeIndex={activeIndex}
                                                        query={query}
                                                        onSelect={() => handleSelect(item)}
                                                        onHover={() => setActiveIndex(i)}
                                                    />
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

function SearchItemRow({ 
    item, 
    index, 
    activeIndex, 
    query, 
    onSelect, 
    onHover 
}: { 
    item: SearchItem, 
    index: number, 
    activeIndex: number, 
    query: string,
    onSelect: () => void,
    onHover: () => void
}) {
    if (item.type === 'action') {
        return (
            <button
                data-active={index === activeIndex}
                onClick={onSelect}
                onMouseEnter={onHover}
                className={cn(
                    'w-full flex items-center gap-3 px-4 h-10 text-left transition-colors',
                    index === activeIndex
                        ? 'bg-[#1a1a1a] text-foreground'
                        : 'text-foreground hover:bg-[#1a1a1a]'
                )}
            >
                {item.icon}
                <span className="flex-1 text-[14px] font-medium">{item.label}</span>
            </button>
        );
    }

    if (item.type === 'view-all') {
        return (
            <button
                data-active={index === activeIndex}
                onClick={onSelect}
                onMouseEnter={onHover}
                className={cn(
                    'w-full flex items-center px-4 h-10 text-left transition-colors mt-1',
                    index === activeIndex
                        ? 'bg-[#1a1a1a] text-foreground'
                        : 'text-foreground hover:bg-[#1a1a1a]'
                )}
            >
                <span className="text-[13px] font-medium">View All...</span>
            </button>
        );
    }

    const isProject = item.type === 'project';
    const title = isProject ? (item.item as Project).name : (item.item as BuilderWorkspaceSummary).title;
    const updatedAt = item.item.updatedAt;

    return (
        <button
            data-active={index === activeIndex}
            onClick={onSelect}
            onMouseEnter={onHover}
            className={cn(
                'w-full flex items-center gap-3 px-4 h-10 text-left transition-colors',
                index === activeIndex
                    ? 'bg-[#1a1a1a] text-foreground'
                    : 'text-foreground hover:bg-[#1a1a1a]'
            )}
        >
            {isProject ? (
                <Folder className="h-4 w-4 shrink-0 text-foreground" />
            ) : (
                <MessageCircle className="h-4 w-4 shrink-0 text-foreground" />
            )}
            <p className="flex-1 min-w-0 text-[14px] font-medium truncate">
                {query ? highlightMatch(title, query) : title}
            </p>
            <span className="text-[12px] text-foreground-muted shrink-0">
                {formatRelativeTime(updatedAt)}
            </span>
        </button>
    );
}

/** Wraps matched substring in a <mark> for highlighting */
function highlightMatch(text: string, query: string) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-transparent text-foreground font-bold">
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </>
    );
}
