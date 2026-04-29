import { useState } from 'react';
import { CircleDashed, MoreHorizontal, Trash2, Edit2, Star, StarOff } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui';
import { SimpleTooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { BuilderWorkspaceSummary } from '@/types/code';
import { formatDistanceToNow } from 'date-fns';

interface WorkspaceItemProps {
    workspace: BuilderWorkspaceSummary;
    isFavorite: boolean;
    onToggleFavorite: (id: string) => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
}

export function WorkspaceItem({
    workspace,
    isFavorite,
    onToggleFavorite,
    onRename,
    onDelete,
}: WorkspaceItemProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const timeAgo = formatDistanceToNow(workspace.updatedAt, { addSuffix: true });

    return (
        <SimpleTooltip 
            content={
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{workspace.title}</span>
                    <span className="text-foreground-muted">Draft • {timeAgo}</span>
                </div>
            }
            side="right"
        >
            <div
                className="group relative flex items-center gap-3 px-2 h-9 rounded-md text-[13px] text-[#a3a3a3] hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/code/${workspace.id}`}
            >
                <CircleDashed className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{workspace.title}</span>

                <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <button 
                            className={cn(
                                "flex items-center justify-center w-6 h-6 rounded-md hover:bg-surface-3 text-foreground-muted hover:text-foreground transition-colors",
                                isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-surface border-border text-foreground">
                        <DropdownMenuItem 
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(workspace.id);
                                setIsMenuOpen(false);
                            }}
                            className="gap-2 cursor-pointer focus:bg-surface-2"
                        >
                            {isFavorite ? (
                                <>
                                    <StarOff className="h-4 w-4" />
                                    <span>Remove from favorites</span>
                                </>
                            ) : (
                                <>
                                    <Star className="h-4 w-4" />
                                    <span>Add to favorites</span>
                                </>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={(e) => {
                                e.stopPropagation();
                                const newTitle = prompt("Rename workspace:", workspace.title);
                                if (newTitle && newTitle !== workspace.title) {
                                    onRename(workspace.id, newTitle);
                                }
                                setIsMenuOpen(false);
                            }}
                            className="gap-2 cursor-pointer focus:bg-surface-2"
                        >
                            <Edit2 className="h-4 w-4" />
                            <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border-subtle" />
                        <DropdownMenuItem 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete "${workspace.title}"?`)) {
                                    onDelete(workspace.id);
                                }
                                setIsMenuOpen(false);
                            }}
                            className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </SimpleTooltip>
    );
}
