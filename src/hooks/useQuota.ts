'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './useAuth';

import { AIModel } from '@/types/chat';

const WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours in ms

const supabase = createClient();

export interface QuotaState {
    used: number;
    limit: number;
    pct: number;
    isNearLimit: boolean;  // >= 90%
    isExceeded: boolean;   // >= 100%
    loading: boolean;
}

export function useQuota(modelId: string, models?: AIModel[]) {
    const { user } = useAuth();

    // We get the limit from the models array (which now has quota_limit properties from the DB),
    // but default to 500,000 if not found for whatever reason.
    const limit = models?.find(m => m.id === modelId)?.quota_limit ?? 500_000;

    const [state, setState] = useState<QuotaState>({
        used: 0,
        limit,
        pct: 0,
        isNearLimit: false,
        isExceeded: false,
        loading: true,
    });

    const buildState = useCallback((used: number, lim: number): QuotaState => {
        const pct = used / lim;
        return {
            used,
            limit: lim,
            pct,
            isNearLimit: pct >= 0.9,
            isExceeded: pct >= 1.0,
            loading: false,
        };
    }, []);

    const refresh = useCallback(async () => {
        if (!user) return;

        const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

        const { data, error } = await supabase
            .from('token_usage')
            .select('tokens_used')
            .eq('user_id', user.id)
            .eq('model_id', modelId)
            .gte('created_at', windowStart);

        if (error) {
            console.error('[useQuota] fetch error:', error.message);
            return;
        }

        const used = (data ?? []).reduce((sum: number, row: { tokens_used: number }) => sum + row.tokens_used, 0);
        setState(buildState(used, limit));
    }, [user, modelId, limit, buildState]);

    // Update from response headers (instant feedback after a message)
    const updateFromHeaders = useCallback((headers: Headers) => {
        const usedHeader = headers.get('X-Quota-Used');
        const limitHeader = headers.get('X-Quota-Limit');
        if (usedHeader && limitHeader) {
            setState(buildState(parseInt(usedHeader, 10), parseInt(limitHeader, 10)));
        }
    }, [buildState]);

    // Fetch on mount and when model/user changes
    useEffect(() => {
        setState(prev => ({ ...prev, loading: true, limit }));
        refresh();
    }, [user, modelId, limit, refresh]);

    return { ...state, refresh, updateFromHeaders };
}
