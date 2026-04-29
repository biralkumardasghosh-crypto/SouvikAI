'use client';

import { useRef } from 'react';
import { X, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorTabsProps {
    openTabs: string[];
    activePath: string | null;
    dirtyPaths?: Set<string>;
    onSelect: (path: string) => void;
    onClose: (path: string) => void;
}

const EXT_COLOUR: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#61dafb',
    py: '#3572A5', rs: '#dea584', go: '#00add8', html: '#e44b23',
    css: '#563d7c', scss: '#c6538c', json: '#f5a623', md: '#fff',
    sql: '#e38c00', sh: '#89e051',
};

function tabColour(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return EXT_COLOUR[ext] ?? '#858585';
}

function basename(path: string) {
    return path.split('/').pop() || path;
}

export function EditorTabs({ openTabs, activePath, dirtyPaths = new Set(), onSelect, onClose }: EditorTabsProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    if (openTabs.length === 0) return null;

    return (
        <div
            ref={scrollRef}
            className="flex items-end overflow-x-auto overflow-y-hidden scrollbar-hide bg-[#2d2d2d] border-b border-[#3e3e42] shrink-0"
            style={{ height: 36 }}
        >
            {openTabs.map(path => {
                const isActive = path === activePath;
                const isDirty = dirtyPaths.has(path);
                const name = basename(path);
                const colour = tabColour(name);

                return (
                    <div
                        key={path}
                        onClick={() => onSelect(path)}
                        className={cn(
                            'group flex items-center gap-1.5 px-3 h-full text-[13px] cursor-pointer whitespace-nowrap border-r border-[#3e3e42] select-none transition-colors duration-100 relative',
                            isActive
                                ? 'bg-[#1e1e1e] text-[#d4d4d4]'
                                : 'bg-[#2d2d2d] text-[#858585] hover:bg-[#2a2d2e] hover:text-[#d4d4d4]',
                        )}
                        style={{ minWidth: 100, maxWidth: 180 }}
                    >
                        {/* Active top border */}
                        {isActive && (
                            <span className="absolute top-0 left-0 right-0 h-[2px] bg-[#0078d4] rounded-b" />
                        )}

                        {/* Dot colour */}
                        <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: colour, opacity: 0.8 }}
                        />

                        {/* Filename */}
                        <span className="truncate flex-1">{name}</span>

                        {/* Dirty / close button */}
                        <button
                            onClick={e => { e.stopPropagation(); onClose(path); }}
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-white/10 shrink-0 ml-1"
                            title="Close"
                        >
                            {isDirty
                                ? <Circle className="w-2.5 h-2.5 fill-current text-[#cccccc]" />
                                : <X className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
