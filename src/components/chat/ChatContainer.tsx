'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui';
import { Message } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { PromptSuggestions } from './PromptSuggestions';
import { ChatInput } from './ChatInput';
import { useChatPreferences } from '@/hooks/useChatPreferences';
import type { Attachment } from '@/types/attachments';
import { cn } from '@/lib/utils';

interface ChatContainerProps {
    messages: Message[];
    isLoading: boolean;
    error: string | null;
    onSend?: (message: string, attachments: Attachment[], tool?: string) => void;
    onStop?: () => void;
    onRegenerate?: (assistantMessageId: string) => void;
    /** Called when the user clicks a prompt suggestion — pre-fills the empty-state ChatInput. */
    onSuggestionSelect?: (prompt: string) => void;
    /** Pre-fills the empty-state ChatInput (lifted from parent). */
    pendingMessage?: string;
    onPendingMessageConsumed?: () => void;
}

// ── Date divider helpers ────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function formatDayLabel(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (isSameDay(date, today)) return 'Today';
    if (isSameDay(date, yesterday)) return 'Yesterday';

    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: sameYear ? undefined : 'numeric',
    });
}

function DateDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 px-4 my-1.5 select-none" role="separator" aria-label={label}>
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {label}
            </span>
            <div className="flex-1 h-px bg-border/40" />
        </div>
    );
}

// ── Component ───────────────────────────────────────────────────────────────

export function ChatContainer({
    messages, isLoading, error,
    onSend, onStop, onRegenerate,
    onSuggestionSelect, pendingMessage, onPendingMessageConsumed,
}: ChatContainerProps) {
    const { preferences } = useChatPreferences();
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRootRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const hasMessages = messages.length > 0;

    /**
     * Track whether the bottom sentinel is visible. We use an IntersectionObserver
     * against the nearest scrollable ancestor (Radix's ScrollArea viewport)
     * so the result holds even on resize / orientation change.
     */
    useEffect(() => {
        if (!hasMessages) return;
        const target = bottomRef.current;
        if (!target) return;

        // Walk up to the actual scroll container — Radix wraps the viewport
        // in a div with [data-radix-scroll-area-viewport]; fall back to the
        // closest ancestor that scrolls.
        const scrollEl =
            target.closest<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;

        const observer = new IntersectionObserver(
            ([entry]) => setIsAtBottom(entry.isIntersecting),
            {
                root: scrollEl,
                // Treat "within 120px of bottom" as at-bottom — feels natural
                // and prevents the pill flickering when the input grows.
                rootMargin: '0px 0px 120px 0px',
                threshold: 0,
            }
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMessages]);

    /**
     * Auto-scroll only when the user is already at (or near) the bottom.
     * If they've scrolled up to read history, respect that — the floating
     * "scroll to bottom" pill gives them an explicit way back.
     */
    useEffect(() => {
        if (!isAtBottom) return;
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, isLoading, isAtBottom]);

    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, []);

    // ── Empty state — heading + input + suggestions centred together ────────────
    if (messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 min-h-0 overflow-y-auto">
                <div className="w-full max-w-2xl flex flex-col items-center gap-8 animate-fade-in px-2">
                    <h1 className="text-2xl md:text-[2rem] font-semibold text-foreground tracking-tight">
                        What can I help with?
                    </h1>

                    {/* Full-featured ChatInput — dropdown, attachments, accent send btn */}
                    {onSend && (
                        <div className="w-full max-w-[640px] -mx-4 -mb-4">
                            <ChatInput
                                onSend={onSend}
                                onStop={onStop}
                                isLoading={isLoading}
                                pendingMessage={pendingMessage}
                                onPendingMessageConsumed={onPendingMessageConsumed}
                            />
                        </div>
                    )}

                    {preferences.showPromptSuggestions && onSuggestionSelect && (
                        <PromptSuggestions onSelect={onSuggestionSelect} />
                    )}
                </div>
            </div>
        );
    }

    // ── Conversation view ───────────────────────────────────────────────────────
    return (
        <div ref={scrollRootRef} className="relative flex-1 h-full w-full min-h-0">
            <ScrollArea className="h-full w-full">
                <div className="flex flex-col min-h-full w-full py-2 md:py-4">
                    <div className="flex-1 w-full max-w-full md:max-w-3xl mx-auto space-y-4 md:space-y-6 pb-4 px-1 md:px-0">
                        {messages.map((msg, index) => {
                            const prev = messages[index - 1];
                            const showDate =
                                msg.createdAt instanceof Date &&
                                !isNaN(msg.createdAt.getTime()) &&
                                (!prev ||
                                    !(prev.createdAt instanceof Date) ||
                                    !isSameDay(prev.createdAt, msg.createdAt));

                            return (
                                <Fragment key={msg.id}>
                                    {showDate && <DateDivider label={formatDayLabel(msg.createdAt)} />}
                                    <MessageBubble
                                        message={msg}
                                        isLoading={isLoading && index === messages.length - 1 && msg.role === 'assistant'}
                                        onRegenerate={onRegenerate}
                                    />
                                </Fragment>
                            );
                        })}
                        {error && (
                            <div className="px-4 py-2 animate-slide-up">
                                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl shadow-sm flex items-center gap-3">
                                    <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                                    {error}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} className="h-4" />
                    </div>
                </div>
            </ScrollArea>

            {/* Floating scroll-to-bottom pill — only visible when the user has
                scrolled up away from the latest message. */}
            <button
                type="button"
                onClick={scrollToBottom}
                aria-label="Scroll to latest message"
                className={cn(
                    'absolute left-1/2 -translate-x-1/2 bottom-3 z-10',
                    'h-8 w-8 rounded-full flex items-center justify-center',
                    'bg-[#2a2a2a]/95 border border-white/15 text-foreground shadow-lg backdrop-blur-md',
                    'hover:bg-[#333] transition-all duration-150',
                    isAtBottom
                        ? 'opacity-0 translate-y-2 pointer-events-none'
                        : 'opacity-100 translate-y-0 pointer-events-auto'
                )}
            >
                <ArrowDown className="h-4 w-4" />
            </button>
        </div>
    );
}
