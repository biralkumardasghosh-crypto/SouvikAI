import { useState } from 'react';
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import type { BuilderWorkspaceSummary } from '@/types/code';
import { WorkspaceItem } from './WorkspaceItem';

interface WorkspaceListProps {
    workspaces: BuilderWorkspaceSummary[];
    isLoading: boolean;
    favorites: Set<string>;
    onToggleFavorite: (id: string) => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
}

export function WorkspaceList({
    workspaces,
    isLoading,
    favorites,
    onToggleFavorite,
    onRename,
    onDelete,
}: WorkspaceListProps) {
    const [favoritesOpen, setFavoritesOpen] = useState(true);
    const [recentOpen, setRecentOpen] = useState(true);

    const favoriteWorkspaces = workspaces.filter(w => favorites.has(w.id));

    return (
        <div className="flex flex-col gap-4 px-2 mt-4 pb-4 overflow-y-auto scrollbar-thin">
            {/* Favorites Section */}
            <div>
                <button
                    onClick={() => setFavoritesOpen(!favoritesOpen)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-[13px] font-semibold text-foreground-subtle hover:text-foreground transition-colors group"
                >
                    <span className="flex-1 text-left">Favorites</span>
                    {favoritesOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                </button>
                {favoritesOpen && (
                    <div className="mt-1 flex flex-col gap-0.5">
                        {favoriteWorkspaces.length === 0 ? (
                            <div className="px-2 py-1 text-[12px] text-foreground-muted">No favorites yet</div>
                        ) : (
                            favoriteWorkspaces.map(w => (
                                <WorkspaceItem
                                    key={`fav-${w.id}`}
                                    workspace={w}
                                    isFavorite={true}
                                    onToggleFavorite={onToggleFavorite}
                                    onRename={onRename}
                                    onDelete={onDelete}
                                />
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Recent Chats Section */}
            <div>
                <button
                    onClick={() => setRecentOpen(!recentOpen)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-[13px] font-semibold text-foreground-subtle hover:text-foreground transition-colors group"
                >
                    <span className="flex-1 text-left">Recent Chats</span>
                    {recentOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                </button>
                {recentOpen && (
                    <div className="mt-1 flex flex-col gap-0.5">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4 text-foreground-muted">
                                <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                        ) : workspaces.length === 0 ? (
                            <div className="px-2 py-1 text-[12px] text-foreground-muted">No recent chats</div>
                        ) : (
                            workspaces.map(w => (
                                <WorkspaceItem
                                    key={w.id}
                                    workspace={w}
                                    isFavorite={favorites.has(w.id)}
                                    onToggleFavorite={onToggleFavorite}
                                    onRename={onRename}
                                    onDelete={onDelete}
                                />
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
