'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { CodeWorkspace } from '@/components/code/CodeWorkspace';
import { useBuilderAgent } from '@/hooks/useBuilderAgent';
import { useModels } from '@/hooks/useModels';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui';
import { FORGE_NEXT_MODEL_KEY } from '../page';

export default function BuilderWorkspacePage() {
    const params = useParams<{ id: string }>();
    const workspaceId = params?.id ?? '';
    const router = useRouter();

    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const { models } = useModels();
    const {
        workspace,
        isLoading,
        loadError,
        isStreaming,
        error,
        selectedModelId,
        setSelectedModelId,
        setActiveFile,
        updateFile,
        sendMessage,
        resumePending,
        abort,
        acceptChanges,
        rejectChanges,
    } = useBuilderAgent(workspaceId);

    // Auth gate.
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push('/signin');
        }
    }, [authLoading, isAuthenticated, router]);

    // Pick up the model the user selected on the /code landing composer
    // (if any) and seed the workspace's selected model with it. Read +
    // clear once on mount so subsequent reloads don't get sticky values.
    const seededModelRef = useRef(false);
    useEffect(() => {
        if (seededModelRef.current) return;
        if (typeof window === 'undefined') return;
        seededModelRef.current = true;
        try {
            const stored = window.sessionStorage.getItem(FORGE_NEXT_MODEL_KEY);
            if (stored) {
                setSelectedModelId(stored);
                window.sessionStorage.removeItem(FORGE_NEXT_MODEL_KEY);
            }
        } catch {
            /* sessionStorage may be disabled — fall back to default */
        }
    }, [setSelectedModelId]);

    // After hydration, if the most recent message is an unanswered user
    // turn — typically the seed message inserted at workspace creation — kick
    // off the agent automatically.
    const autoStartedRef = useRef(false);
    useEffect(() => {
        if (autoStartedRef.current) return;
        if (!isAuthenticated) return;
        if (!workspace || isLoading) return;
        if (isStreaming) return;
        const last = workspace.messages[workspace.messages.length - 1];
        if (!last || last.role !== 'user') {
            autoStartedRef.current = true;
            return;
        }
        autoStartedRef.current = true;
        // Defer to next tick so the workspace UI mounts before the stream
        // starts firing setState updates.
        const t = setTimeout(() => {
            void resumePending();
        }, 0);
        return () => clearTimeout(t);
    }, [
        isAuthenticated,
        isLoading,
        isStreaming,
        workspace,
        resumePending,
    ]);

    if (authLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
                <div className="h-10 w-10 rounded-md bg-foreground text-background flex items-center justify-center mb-4">
                    <Sparkles className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold text-foreground">
                    We couldn&apos;t open this build
                </h1>
                <p className="mt-2 text-[14px] text-foreground-muted max-w-md">
                    {loadError}
                </p>
                <Button asChild variant="outline" className="mt-6">
                    <Link href="/code">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Forge home
                    </Link>
                </Button>
            </div>
        );
    }

    if (isLoading || !workspace) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
            </div>
        );
    }

    return (
        <CodeWorkspace
            title={workspace.title}
            files={workspace.files}
            activeFile={workspace.activeFile}
            messages={workspace.messages}
            isStreaming={isStreaming}
            error={error}
            models={models}
            selectedModelId={selectedModelId}
            onModelChange={setSelectedModelId}
            onSelectFile={setActiveFile}
            onUpdateFile={updateFile}
            onSend={sendMessage}
            onStop={abort}
            onAcceptChanges={acceptChanges}
            onRejectChanges={rejectChanges}
        />
    );
}
