import { useState } from 'react';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNav } from './SidebarNav';
import { WorkspaceList } from './WorkspaceList';
import { CodeSearchModal } from './CodeSearchModal';
import { useCodeWorkspaces } from '@/contexts/CodeWorkspacesContext';

export function CodeSidebar() {
    const { workspaces, isLoading, favorites, toggleFavorite, renameWorkspace, deleteWorkspace } = useCodeWorkspaces();
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    return (
        <aside className="w-[260px] h-full flex flex-col bg-surface border-r border-border shrink-0 select-none">
            <SidebarHeader onOpenSearch={() => setIsSearchOpen(true)} />
            <SidebarNav />
            <WorkspaceList
                workspaces={workspaces}
                isLoading={isLoading}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onRename={renameWorkspace}
                onDelete={deleteWorkspace}
            />
            
            <CodeSearchModal
                open={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                workspaces={workspaces}
            />
        </aside>
    );
}
