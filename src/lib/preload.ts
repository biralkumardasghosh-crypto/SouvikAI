'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// Cache for preloaded data
const preloadCache = {
    sessions: new Map<string, Promise<any[]>>(),
    profile: new Map<string, Promise<any>>(),
};

/**
 * Preload sessions for a user - call this as early as possible when you have a user ID
 * Returns a promise that resolves to the sessions array
 */
export function preloadSessions(userId: string): Promise<any[]> {
    // Return existing promise if already loading/loaded
    if (preloadCache.sessions.has(userId)) {
        return preloadCache.sessions.get(userId)!;
    }

    const promise = Promise.resolve(
        supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .then(({ data, error }) => {
                if (error) throw error;
                return data || [];
            })
    );

    preloadCache.sessions.set(userId, promise);
    return promise;
}

/**
 * Preload profile for a user
 * Returns a promise that resolves to the profile
 */
export function preloadProfile(userId: string): Promise<any> {
    // Return existing promise if already loading/loaded
    if (preloadCache.profile.has(userId)) {
        return preloadCache.profile.get(userId)!;
    }

    const promise = Promise.resolve(
        supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
            .then(({ data, error }) => {
                if (error) throw error;
                return data;
            })
    );

    preloadCache.profile.set(userId, promise);
    return promise;
}

/**
 * Preload both profile and sessions in parallel
 * Call this as soon as you have a user ID (e.g., from getSession)
 */
export function preloadUserData(userId: string): {
    profilePromise: Promise<any>;
    sessionsPromise: Promise<any[]>;
} {
    return {
        profilePromise: preloadProfile(userId),
        sessionsPromise: preloadSessions(userId),
    };
}

/**
 * Clear preload cache (call on sign out)
 */
export function clearPreloadCache() {
    preloadCache.sessions.clear();
    preloadCache.profile.clear();
}

/**
 * Get cached sessions if available (for immediate use without waiting)
 */
export function getCachedSessionsPromise(userId: string): Promise<any[]> | null {
    return preloadCache.sessions.get(userId) || null;
}
