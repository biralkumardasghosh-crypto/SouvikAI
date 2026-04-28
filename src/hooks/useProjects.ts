/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Project } from '@/types/projects';
import { useAuth } from './useAuth';

const supabase = createClient();

function mapProjectRow(row: any): Project {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}

export interface UseProjectsResult {
    projects: Project[];
    isLoaded: boolean;
    createProject: (name: string) => Promise<Project | null>;
    renameProject: (id: string, name: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    /** Manually refetch (useful when sessions cause project metadata to change). */
    refresh: () => Promise<void>;
}

/**
 * CRUD hook for the current user's projects.
 *
 * Mirrors the design of `useChat` for sessions: optimistic local updates
 * paired with Supabase writes. RLS guarantees we can only see/mutate our
 * own rows, so no extra `eq('user_id', …)` is required on writes.
 */
export function useProjects(): UseProjectsResult {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const loadingUserIdRef = useRef<string | null>(null);

    const sortByRecency = (list: Project[]) =>
        [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const load = useCallback(async (userId: string) => {
        if (loadingUserIdRef.current === userId) return;
        loadingUserIdRef.current = userId;

        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false });

            if (!error && data) {
                setProjects((data as any[]).map(mapProjectRow));
                setIsLoaded(true);
            }
        } finally {
            loadingUserIdRef.current = null;
        }
    }, []);

    const refresh = useCallback(async () => {
        if (user) await load(user.id);
    }, [user, load]);

    // Load on user change
    useEffect(() => {
        if (user && !isLoaded) {
            void load(user.id);
        }
    }, [user, isLoaded, load]);

    // Reset when user signs out
    useEffect(() => {
        if (!user) {
            setProjects([]);
            setIsLoaded(false);
        }
    }, [user]);

    const createProject = useCallback(async (name: string): Promise<Project | null> => {
        if (!user) return null;
        const trimmed = name.trim();
        if (!trimmed) return null;

        const { data, error } = await supabase
            .from('projects')
            .insert({ user_id: user.id, name: trimmed })
            .select()
            .single();

        if (error || !data) {
            console.error('Failed to create project:', error);
            return null;
        }

        const project = mapProjectRow(data);
        setProjects((prev) => sortByRecency([project, ...prev]));
        return project;
    }, [user]);

    const renameProject = useCallback(async (id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;

        // Optimistic update
        setProjects((prev) =>
            sortByRecency(
                prev.map((p) =>
                    p.id === id ? { ...p, name: trimmed, updatedAt: new Date() } : p
                )
            )
        );

        const { error } = await supabase
            .from('projects')
            .update({ name: trimmed })
            .eq('id', id);

        if (error) {
            console.error('Failed to rename project:', error);
            // Re-sync with server state on failure
            void refresh();
        }
    }, [refresh]);

    const deleteProject = useCallback(async (id: string) => {
        // Optimistic remove
        setProjects((prev) => prev.filter((p) => p.id !== id));

        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Failed to delete project:', error);
            void refresh();
        }
    }, [refresh]);

    return {
        projects,
        isLoaded,
        createProject,
        renameProject,
        deleteProject,
        refresh,
    };
}
