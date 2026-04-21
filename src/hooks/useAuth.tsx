'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { preloadUserData, clearPreloadCache } from '@/lib/preload';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { User, AuthState } from '@/types/auth';
import { Database } from '@/types/database';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType extends AuthState {
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signUp: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Singleton client
const supabase = createClient();

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]         = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Refs avoid stale-closure issues inside async callbacks
    const currentUserIdRef  = useRef<string | null>(null);
    const profileCacheRef   = useRef<Map<string, User>>(new Map());
    const initializedRef    = useRef(false);

    const mapProfileToUser = useCallback((profileData: ProfileRow, supabaseUser?: SupabaseUser): User => ({
        id:               profileData.id,
        email:            profileData.email,
        displayName:      supabaseUser?.user_metadata?.display_name,
        createdAt:        new Date(profileData.created_at),
        suspendedUntil:   profileData.suspended_until ? new Date(profileData.suspended_until) : null,
        suspensionReason: profileData.suspension_reason,
        isDeleted:        profileData.is_deleted,
        deletionReason:   profileData.deletion_reason,
        isKicked:         profileData.is_kicked,
    }), []);

    /**
     * Fetch (or return cached) full profile for a Supabase user.
     * Returns null if the profile doesn't exist or the fetch fails.
     */
    const mapSupabaseUser = useCallback(async (
        supabaseUser: SupabaseUser | null,
        forceRefresh = false,
    ): Promise<User | null> => {
        if (!supabaseUser) return null;

        if (!forceRefresh && profileCacheRef.current.has(supabaseUser.id)) {
            return profileCacheRef.current.get(supabaseUser.id)!;
        }

        try {
            const { profilePromise } = preloadUserData(supabaseUser.id);
            const profile = await profilePromise;
            if (!profile) return null;

            const mappedUser = mapProfileToUser(profile as ProfileRow, supabaseUser);
            profileCacheRef.current.set(supabaseUser.id, mappedUser);
            return mappedUser;
        } catch {
            return null;
        }
    }, [mapProfileToUser]);

    const refreshUser = useCallback(async () => {
        const { data: { user: supabaseUser } } = await supabase.auth.getUser();
        const mappedUser = await mapSupabaseUser(supabaseUser, true);
        setUser(mappedUser);
    }, [mapSupabaseUser]);

    useEffect(() => {
        let mounted = true;

        /**
         * Build a minimal User object directly from the Supabase session so the
         * UI can render immediately while the full profile fetch is in flight.
         */
        const buildOptimisticUser = (su: SupabaseUser): User => ({
            id:               su.id,
            email:            su.email || '',
            displayName:      su.user_metadata?.display_name,
            createdAt:        new Date(su.created_at),
            suspendedUntil:   null,
            suspensionReason: null,
            isDeleted:        false,
            deletionReason:   null,
            isKicked:         false,
        });

        const initAuth = async () => {
            try {
                // getSession() reads from the cookie — fast, no network round-trip.
                const { data: { session } } = await supabase.auth.getSession();

                if (mounted && session?.user) {
                    currentUserIdRef.current = session.user.id;

                    // Show something immediately so the page doesn't flicker.
                    setUser(buildOptimisticUser(session.user));

                    // Fetch full profile in the background.
                    mapSupabaseUser(session.user).then((mappedUser) => {
                        if (mounted && mappedUser) setUser(mappedUser);
                    });
                } else if (mounted) {
                    setUser(null);
                }
            } catch (e) {
                console.error('[Auth] initAuth error:', e);
                if (mounted) setUser(null);
            } finally {
                // ── CRITICAL: always resolve isLoading after the first session check. ──
                // Supabase's onAuthStateChange may fire with INITIAL_SESSION synchronously
                // or asynchronously depending on the client version and network state.
                // Never relying on it exclusively prevents the infinite spinner on first
                // visit and on random reloads.
                if (mounted) {
                    setIsLoading(false);
                    initializedRef.current = true;
                }
            }
        };

        initAuth();

        // onAuthStateChange handles token refreshes and sign-in/sign-out after init.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;

            // Skip if we're still in the initial synchronous setup to avoid a
            // double-render race with initAuth.
            if (event === 'INITIAL_SESSION') {
                // initAuth already handled the initial session; ensure loading is cleared.
                if (mounted && !initializedRef.current) {
                    if (mounted) setIsLoading(false);
                    initializedRef.current = true;
                }
                return;
            }

            if (session?.user) {
                const isNewUser = currentUserIdRef.current !== session.user.id;
                currentUserIdRef.current = session.user.id;

                if (isNewUser) {
                    // Different user (or first sign-in after init found no session).
                    setUser(buildOptimisticUser(session.user));
                }

                const mappedUser = await mapSupabaseUser(session.user, isNewUser);
                if (mounted) {
                    if (mappedUser) setUser(mappedUser);
                    setIsLoading(false);
                }
            } else {
                // Signed out or session expired.
                currentUserIdRef.current = null;
                profileCacheRef.current.clear();
                clearPreloadCache();
                if (mounted) {
                    setUser(null);
                    setIsLoading(false);
                }
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [mapSupabaseUser]);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message || null };
    };

    const signUp = async (email: string, password: string) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message || null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                signIn,
                signUp,
                signOut,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
