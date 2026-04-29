'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { Button, SimpleTooltip } from '@/components/ui';
import { BuilderChatInput } from '@/components/code/BuilderChatInput';
import { useAuth } from '@/hooks/useAuth';

const SUGGESTIONS = [
    'A SaaS landing page with hero, features, and pricing',
    'A minimal personal blog with a clean reading layout',
    'A dashboard with sidebar nav and stat cards',
    'A waitlist page with a form and a hero image',
];

/**
 * Forge home: a focused composer that captures the user's first prompt,
 * provisions a new workspace in Supabase, and routes them to /code/[id]
 * where the agent immediately picks up the pending message.
 */
export default function CodeLandingPage() {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const router = useRouter();
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
        [creating, router],
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
            {/* Slim top bar — escape hatch back to chat */}
            <header className="shrink-0 flex items-center gap-2 h-12 px-4 border-b border-border-subtle">
                <SimpleTooltip content="Back to chat" side="bottom">
                    <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-foreground-muted hover:text-foreground"
                    >
                        <Link href="/" aria-label="Back to chat">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                </SimpleTooltip>
                <div className="flex items-center gap-2 text-foreground">
                    <div className="h-6 w-6 rounded-md bg-foreground text-background flex items-center justify-center">
                        <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[13px] font-semibold">Forge</span>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-2xl">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground text-balance">
                            What are you going to build today?
                        </h1>
                        <p className="mt-3 text-foreground-muted text-[15px] text-pretty">
                            Describe an app, a page, or a component. Forge spins up a
                            Next.js + Tailwind project and writes the code for you.
                        </p>
                    </div>

                    {creating ? (
                        <div className="flex items-center justify-center gap-2 h-[124px] rounded-2xl border border-border bg-surface text-foreground-muted">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-[14px]">Creating your build…</span>
                        </div>
                    ) : (
                        <BuilderChatInput
                            variant="centered"
                            placeholder="A pricing page with three tiers and a FAQ section…"
                            onSend={handleSend}
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

                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                disabled={creating}
                                onClick={() => handleSend(s)}
                                className="text-[13px] text-foreground-muted hover:text-foreground bg-surface hover:bg-surface-2 border border-border rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <p className="mt-8 text-center text-[12px] text-foreground-subtle">
                        Forge uses your selected AI model. Token usage counts against
                        your quota.
                    </p>
                </div>
            </main>
        </div>
    );
}
