'use client';

import { useEffect, useState } from 'react';
import type { AIModel } from '@/types/chat';

/**
 * Lightweight fetcher for the /api/models endpoint. Used by the Builder
 * workspace which doesn't otherwise need the full {@link useChat} hook.
 *
 * The list is fetched once per mount and cached in component state — the
 * model catalog rarely changes mid-session.
 */
export function useModels(): { models: AIModel[]; isLoading: boolean; error: string | null } {
    const [models, setModels] = useState<AIModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/models', { cache: 'no-store' });
                if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
                const data = await res.json();
                if (!cancelled && Array.isArray(data)) setModels(data);
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return { models, isLoading, error };
}
