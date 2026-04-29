'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button, SimpleTooltip } from '@/components/ui';
import { BuilderChatInput } from '@/components/code/BuilderChatInput';
import { useAuth } from '@/hooks/useAuth';
import { useModels } from '@/hooks/useModels';
import { FORGE_NEXT_MODEL_KEY } from '@/lib/codeHandoff';

/**
 * Forge home: a single, focused composer that captures the user's first
 * prompt, provisions a new workspace in Supabase, and routes them to
 * /code/[id] where the agent immediately picks up the pending message.
 *
 * Intentionally minimal — only a title and the composer — so the eye
 * lands on the input with zero supporting text to parse.
 */
export default function CodeLandingPage() {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { models } = useModels();
    const [selectedModelId, setSelectedModelId] = useState<string>('auto');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push('/signin');
        }
    }, [authLoading, isAuthenticated, router]);

    const handleSend = useCallback(
        async (message: string) => {
            const trimmed = message.trim();
            if (!trimmed || creating) return;
            setCreating(true);
            setCreateError(null);
            try {
                // Hand the chosen model off to the workspace page before
                // we navigate, so the in-progress build uses it from the
                // very first agent turn.
                if (typeof window !== 'undefined') {
                    try {
                        window.sessionStorage.setItem(
                            FORGE_NEXT_MODEL_KEY,
                            selectedModelId,
                        );
                    } catch {
                        /* sessionStorage may be disabled — fall back to default */
                    }
                }

                const res = await fetch('/api/code/workspaces', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initialMessage: trimmed }),
                });
                if (!res.ok) {
                    let msg = `Couldn't start a new build (${res.status})`;
                    try {
                        const data = await res.json();
                        if (data?.error) msg = data.error;
                    } catch {
                        /* ignore */
                    }
                    throw new Error(msg);
                }
                const data = (await res.json()) as { id: string };
                router.push(`/code/${data.id}`);
            } catch (err) {
                setCreateError((err as Error)?.message || 'Something went wrong.');
                setCreating(false);
            }
        },
        [creating, router, selectedModelId],
    );

    if (authLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-background">
            {/* Slim top bar — escape hatch back to chat. Kept visually
                quiet (no wordmark, no labels) so the page reads as just
                title + composer. */}
            <header className="shrink-0 flex items-center h-10 px-3">
                <SimpleTooltip content="Back to chat" side="bottom">
                    <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-foreground-muted hover:text-foreground"
                    >
                        <Link href="/" aria-label="Back to chat">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                </SimpleTooltip>
            </header>

            <main className="flex-1 flex items-center justify-center px-4 pb-16">
                <div className="w-full max-w-2xl">
                    <h1 className="pb-1 text-3xl sm:text-4xl md:text-[40px] md:leading-[1.15] font-semibold tracking-tight text-foreground text-balance text-center">
                        What will you build today?
                    </h1>

                    <div className="mt-10 md:mt-12">
                        {creating ? (
                            <div className="flex items-center justify-center gap-2 h-[124px] rounded-2xl border border-border bg-surface text-foreground-muted">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-[14px]">Creating your build…</span>
                            </div>
                        ) : (
                            <BuilderChatInput
                                variant="centered"
                                placeholder="Describe an app, a page, or a component…"
                                onSend={handleSend}
                                models={models}
                                selectedModelId={selectedModelId}
                                onModelChange={setSelectedModelId}
                                autoFocus
                            />
                        )}

                        {createError && (
                            <div
                                role="alert"
                                className="mt-3 px-3 py-2 rounded-md text-[13px] bg-destructive/10 text-destructive border border-destructive/20"
                            >
                                {createError}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
