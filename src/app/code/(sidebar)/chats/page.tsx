'use client';

import { useState } from 'react';
import { Search, MoreHorizontal, FolderPlus, ListFilter, X, CircleDashed, Star } from 'lucide-react';
import { useCodeWorkspaces } from '@/contexts/CodeWorkspacesContext';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime } from '@/utils/date-helpers';
import { Button, SimpleTooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { BuilderWorkspaceSummary } from '@/types/code';

export default function ChatsPage() {
    const { workspaces, isLoading, favorites, toggleFavorite } = useCodeWorkspaces();
    const { user } = useAuth();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredWorkspaces = workspaces.filter(w => 
        w.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const userEmailPrefix = user?.email?.split('@')[0] || 'user';

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-foreground p-8 overflow-y-auto">
            <div className="max-w-5xl w-full mx-auto flex flex-col gap-6">
                <h1 className="text-3xl font-bold tracking-tight">Chats</h1>

                {/* Action Bar */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted" />
                        <input
                            type="text"
                            placeholder="Search chats..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 bg-[#141414] border border-[#222] rounded-md pl-10 pr-4 text-[14px] text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[#444] transition-colors"
                        />
                    </div>
                    <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 bg-[#141414] border-[#222]">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="h-10 px-4 shrink-0 bg-[#141414] border-[#222] gap-2">
                        <FolderPlus className="h-4 w-4" />
                        Folder
                    </Button>
                </div>

                {/* Filter Bar */}
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 bg-[#141414] border-[#222] gap-2 text-[12px]">
                        <ListFilter className="h-3.5 w-3.5" />
                        Filter
                    </Button>
                    <div className="flex items-center gap-2 px-3 h-8 bg-[#1a1a1a] border border-[#333] rounded-md text-[12px]">
                        <div className="h-4 w-4 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 shrink-0" />
                        <span className="font-medium text-foreground-muted">
                            <span className="text-foreground">{userEmailPrefix}</span> (you)
                        </span>
                        <button className="text-foreground-muted hover:text-foreground ml-1">
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                </div>

                {/* Data Table */}
                <div className="mt-4 flex flex-col">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-[#222] text-[12px] font-medium text-foreground-muted">
                        <div className="col-span-6">Name</div>
                        <div className="col-span-3">Project</div>
                        <div className="col-span-3 flex justify-end">Updated </div>
                    </div>

                    {/* Rows */}
                    <div className="flex flex-col py-2">
                        {isLoading ? (
                            <div className="py-8 text-center text-[13px] text-foreground-muted">Loading...</div>
                        ) : filteredWorkspaces.length === 0 ? (
                            <div className="py-8 text-center text-[13px] text-foreground-muted">No chats found.</div>
                        ) : (
                            filteredWorkspaces.map(workspace => (
                                <ChatRow 
                                    key={workspace.id}
                                    workspace={workspace}
                                    isFavorite={favorites.has(workspace.id)}
                                    onToggleFavorite={() => toggleFavorite(workspace.id)}
                                    onClick={() => router.push(`/code/${workspace.id}`)}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ChatRow({ 
    workspace, 
    isFavorite, 
    onToggleFavorite, 
    onClick 
}: { 
    workspace: BuilderWorkspaceSummary; 
    isFavorite: boolean;
    onToggleFavorite: () => void;
    onClick: () => void;
}) {
    return (
        <div 
            onClick={onClick}
            className="group grid grid-cols-12 gap-4 px-4 h-14 items-center rounded-lg hover:bg-[#141414] transition-colors cursor-pointer"
        >
            <div className="col-span-6 flex items-center gap-3">
                <span className="text-[14px] font-medium text-foreground truncate">{workspace.title}</span>
            </div>
            <div className="col-span-3 flex items-center gap-2">
                <CircleDashed className="h-4 w-4 text-foreground-muted" />
                <span className="text-[13px] text-foreground-muted">Draft</span>
            </div>
            <div className="col-span-3 flex items-center justify-end gap-4">
                {/* Favorite Star (visible on hover or if already favorite) */}
                <div className={cn(
                    "flex items-center",
                    isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                    <SimpleTooltip content={isFavorite ? "Remove from favourites" : "Add to favourites"} side="top">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite();
                            }}
                            className="p-1 hover:bg-[#222] rounded text-foreground-muted hover:text-amber-400 transition-colors"
                        >
                            {isFavorite ? (
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            ) : (
                                <Star className="h-4 w-4" />
                            )}
                        </button>
                    </SimpleTooltip>
                </div>

                <span className="text-[13px] text-foreground-muted shrink-0 w-12 text-right">
                    {formatRelativeTime(new Date(workspace.updatedAt)).replace(' ago', ' ago')}
                </span>
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 shrink-0" />
                <button 
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 p-1 text-foreground-muted hover:text-foreground transition-all"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
