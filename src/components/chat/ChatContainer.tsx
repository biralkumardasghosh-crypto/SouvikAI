'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui';
import { Message } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { PromptSuggestions } from './PromptSuggestions';
import { ChatInput } from './ChatInput';
import { useChatPreferences } from '@/hooks/useChatPreferences';
import type { Attachment } from '@/types/attachments';

interface ChatContainerProps {
    messages: Message[];
    isLoading: boolean;
    error: string | null;
    onSend?: (message: string, attachments: Attachment[]) => void;
    onStop?: () => void;
    onRegenerate?: (assistantMessageId: string) => void;
    /** Called when the user clicks a prompt suggestion — pre-fills the empty-state ChatInput. */
    onSuggestionSelect?: (prompt: string) => void;
    /** Pre-fills the empty-state ChatInput (lifted from parent). */
    pendingMessage?: string;
    onPendingMessageConsumed?: () => void;
}

export function ChatContainer({
    messages, isLoading, error,
    onSend, onStop, onRegenerate,
    onSuggestionSelect, pendingMessage, onPendingMessageConsumed,
}: ChatContainerProps) {
    const { preferences } = useChatPreferences();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isLoading]);

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
        <ScrollArea className="flex-1 h-full w-full">
            <div className="flex flex-col min-h-full w-full py-2 md:py-4">
                <div className="flex-1 w-full max-w-full md:max-w-3xl mx-auto space-y-4 md:space-y-6 pb-4 px-1 md:px-0">
                    {messages.map((msg, index) => (
                        <MessageBubble
                            key={msg.id}
                            message={msg}
                            isLoading={isLoading && index === messages.length - 1 && msg.role === 'assistant'}
                            onRegenerate={onRegenerate}
                        />
                    ))}
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
    );
}
