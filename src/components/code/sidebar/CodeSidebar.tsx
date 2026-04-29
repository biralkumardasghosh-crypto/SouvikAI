import { useEffect, useState, useCallback } from 'react';
import type { BuilderWorkspaceSummary } from '@/types/code';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNav } from './SidebarNav';
import { WorkspaceList } from './WorkspaceList';

const FAVORITES_KEY = 'code-favorites';

export function CodeSidebar() {
    const [workspaces, setWorkspaces] = useState<BuilderWorkspaceSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [favorites, setFavorites] = useState<Set<string>>(new Set());

    // Load favorites from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(FAVORITES_KEY);
            if (stored) {
                setFavorites(new Set(JSON.parse(stored)));
            }
        } catch {
            // ignore
        }
    }, []);

    // Save favorites to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
        } catch {
            // ignore
        }
    }, [favorites]);

    const fetchWorkspaces = useCallback(async () => {
        try {
            const res = await fetch('/api/code/workspaces');
            if (res.ok) {
                const data = await res.json();
                setWorkspaces(data.workspaces || []);
            }
        } catch (err) {
            console.error('Failed to fetch workspaces', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    const handleToggleFavorite = useCallback((id: string) => {
        setFavorites(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleRename = useCallback(async (id: string, newTitle: string) => {
        // Optimistic update
        setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, title: newTitle } : w));
        try {
            const res = await fetch(`/api/code/workspaces/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle }),
            });
            if (!res.ok) throw new Error('Rename failed');
        } catch (err) {
            console.error(err);
            // Revert on failure
            fetchWorkspaces();
        }
    }, [fetchWorkspaces]);

    const handleDelete = useCallback(async (id: string) => {
        // Optimistic update
        setWorkspaces(prev => prev.filter(w => w.id !== id));
        setFavorites(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        try {
            const res = await fetch(`/api/code/workspaces/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Delete failed');
        } catch (err) {
            console.error(err);
            // Revert on failure
            fetchWorkspaces();
        }
    }, [fetchWorkspaces]);

    return (
        <aside className="w-[260px] h-full flex flex-col bg-surface border-r border-border shrink-0 select-none">
            <SidebarHeader />
            <SidebarNav />
            <WorkspaceList
                workspaces={workspaces}
                isLoading={isLoading}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onRename={handleRename}
                onDelete={handleDelete}
            />
        </aside>
    );
}
