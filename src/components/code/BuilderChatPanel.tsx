'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentTimeline } from './AgentTimeline';
import { BuilderChatInput } from './BuilderChatInput';
import type { BuilderMessage } from '@/types/code';
import type { AIModel } from '@/types/chat';

interface BuilderChatPanelProps {
    messages: BuilderMessage[];
    isStreaming: boolean;
    error: string | null;
    models: AIModel[];
    selectedModelId: string;
    onModelChange: (id: string) => void;
    onSend: (text: string) => void;
    onStop: () => void;
}

export function BuilderChatPanel({
    messages,
    isStreaming,
    error,
    models,
    selectedModelId,
    onModelChange,
    onSend,
    onStop,
}: BuilderChatPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new content. Mirrors the main chat's behavior.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, isStreaming]);

    return (
        <div className="flex flex-col h-full min-h-0 bg-background">
            <header className="shrink-0 flex items-center gap-2 h-12 px-4 border-b border-border-subtle">
                <div className="flex items-center gap-2 text-foreground">
                    <div className="h-6 w-6 rounded-md bg-foreground text-background flex items-center justify-center">
                        <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[13px] font-semibold">Builder</span>
                </div>
            </header>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-foreground-subtle text-sm">
                        <p>Describe what you want to build.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 max-w-full">
                        {messages.map((msg) => (
                            <MessageView key={msg.id} message={msg} isStreaming={isStreaming} />
                        ))}
                    </div>
                )}
            </div>

            {error && (
                <div className="shrink-0 flex items-start gap-2 mx-4 mb-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-[12px]">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                </div>
            )}

            <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border-subtle bg-background">
                <BuilderChatInput
                    variant="compact"
                    placeholder="Tell Builder what to change…"
                    isStreaming={isStreaming}
                    onSend={onSend}
                    onStop={onStop}
                    models={models}
                    selectedModelId={selectedModelId}
                    onModelChange={onModelChange}
                />
            </div>
        </div>
    );
}

function MessageView({
    message,
    isStreaming,
}: {
    message: BuilderMessage;
    isStreaming: boolean;
}) {
    if (message.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md px-3.5 py-2.5 bg-surface-2 text-foreground text-[14px] leading-relaxed whitespace-pre-wrap break-words">
                    {message.content}
                </div>
            </div>
        );
    }

    const isThisStreaming = !!message.isStreaming && isStreaming;
    const hasSteps = (message.steps?.length ?? 0) > 0;

    return (
        <div className="flex flex-col gap-2 max-w-full">
            {hasSteps && (
                <AgentTimeline
                    steps={message.steps ?? []}
                    isStreaming={isThisStreaming}
                />
            )}
            {message.content && (
                <div
                    className={cn(
                        'text-[14px] leading-relaxed whitespace-pre-wrap break-words',
                        message.errored ? 'text-destructive' : 'text-foreground',
                    )}
                >
                    {message.content}
                    {isThisStreaming && (
                        <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-foreground/70 animate-pulse" />
                    )}
                </div>
            )}
            {!message.content && isThisStreaming && !hasSteps && (
                <div className="flex items-center gap-1 text-foreground-subtle text-[13px]">
                    <span className="typing-dot">·</span>
                    <span className="typing-dot">·</span>
                    <span className="typing-dot">·</span>
                </div>
            )}
        </div>
    );
}
