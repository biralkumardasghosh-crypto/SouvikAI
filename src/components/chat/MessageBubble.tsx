'use client';

import { Avatar, AvatarFallback } from '@/components/ui';
import ShinyText from '@/components/ui/ShinyText';
import { useChatPreferences } from '@/hooks/useChatPreferences';
import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { Bot, User, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { MessageActions } from './MessageActions';

interface MessageBubbleProps {
    message: Message;
    isLoading?: boolean;
    /** Called when the user requests a fresh response for this assistant message. */
    onRegenerate?: (assistantMessageId: string) => void;
}

export function MessageBubble({ message, isLoading, onRegenerate }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const { preferences } = useChatPreferences();
    const [copied, setCopied] = useState<string | null>(null);
    const [isThoughtExpanded, setIsThoughtExpanded] = useState(false);

    // Timer state for thinking duration
    const [thoughtStartTime] = useState<number>(Date.now());
    const [thoughtDurationMs, setThoughtDurationMs] = useState<number | null>(null);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(text);
        setTimeout(() => setCopied(null), 2000);
    };

    let displayContent = message.content;
    let isThinking = false;
    let thinkContent = '';

    if (!isUser) {
        // Extract all completely closed think blocks
        const closedThinkMatches = Array.from(displayContent.matchAll(/<think>([\s\S]*?)<\/think>\s*/gi));
        for (const match of closedThinkMatches) {
            thinkContent += match[1].trim() + '\n\n';
        }

        // Remove completely closed think blocks from displayContent
        displayContent = displayContent.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');

        // Check for an unclosed think block
        const openThinkMatch = displayContent.match(/<think>([\s\S]*)$/i);
        if (openThinkMatch) {
            isThinking = true;
            thinkContent += openThinkMatch[1].trim() + '\n\n';
            displayContent = displayContent.substring(0, openThinkMatch.index);
        }

        thinkContent = thinkContent.trim();

        // Hide partial opening tags while streaming starts to prevent flickering
        const trimmed = displayContent.trim();
        if (['<', '<t', '<th', '<thi', '<thin'].includes(trimmed)) {
            isThinking = true;
            displayContent = '';
        }
    }

    const hasThought = thinkContent.length > 0;
    const showThinkingIndicator = (isLoading && !displayContent && !hasThought) || isThinking || hasThought;

    // Track when thinking finishes to lock in the duration
    if (hasThought && !isThinking && thoughtDurationMs === null) {
        setThoughtDurationMs(Date.now() - thoughtStartTime);
    }

    const renderThinkingToggle = () => {
        if (!showThinkingIndicator) return null;

        // If currently thinking: show ShinyText "Thinking..." or expanded thoughts
        if (isThinking || (isLoading && !hasThought)) {
            return (
                <div
                    className="py-1 animate-fade-in cursor-pointer order-first mb-2"
                    onClick={() => hasThought && setIsThoughtExpanded(!isThoughtExpanded)}
                >
                    <ShinyText
                        text={isThoughtExpanded && hasThought ? thinkContent : "Thinking..."}
                        speed={2.5}
                        delay={0.4}
                        color="#6b6b6b"
                        shineColor="#e0e0e0"
                        spread={90}
                        className="text-sm font-medium whitespace-pre-wrap"
                    />
                </div>
            );
        }

        // If thinking has finished: show plain text "Thought for X seconds/minutes"
        const seconds = Math.max(1, Math.floor((thoughtDurationMs ?? 0) / 1000));
        const durationText = seconds >= 60
            ? `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) > 1 ? 's' : ''}`
            : `${seconds} second${seconds > 1 ? 's' : ''}`;

        return (
            <div
                className="py-1 animate-fade-in cursor-pointer order-first mb-2"
                onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
            >
                <div className="text-sm font-medium text-foreground whitespace-pre-wrap">
                    {isThoughtExpanded ? thinkContent : `Thought for ${durationText}`}
                </div>
            </div>
        );
    };

    return (
        <div
            className={cn(
                'group flex gap-3 md:gap-4 px-2 md:px-4 py-2 animate-fade-in hover:bg-muted/30 transition-colors rounded-xl mx-1 md:mx-2',
                isUser ? '' : ''
            )}
        >
            <Avatar className={cn(
                "h-8 w-8 shrink-0 shadow-sm border border-border/50",
                isUser ? "bg-background" : "bg-primary/10"
            )}>
                <AvatarFallback className={cn(
                    "text-xs font-medium",
                    isUser ? "text-foreground" : "text-primary"
                )}>
                    {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground/80">
                        {isUser ? 'You' : "Souvik's AI"}
                    </p>
                </div>
                <div className={cn(
                    "prose prose-invert max-w-none leading-relaxed",
                    preferences.textSize === 'small' ? 'prose-sm text-sm' :
                        preferences.textSize === 'large' ? 'prose-base text-lg' : 'prose-sm text-base',
                    "prose-p:text-foreground/90 prose-headings:text-foreground prose-strong:text-foreground prose-strong:font-semibold",
                    "prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-pre:shadow-sm",
                    "prose-th:border prose-th:border-border/50 prose-th:bg-muted/30 prose-th:px-4 prose-th:py-2",
                    "prose-td:border prose-td:border-border/50 prose-td:px-4 prose-td:py-2",
                    "prose-table:border-collapse prose-table:w-full prose-table:my-4 prose-table:rounded-lg prose-table:overflow-hidden prose-table:border-style-hidden prose-table:shadow-sm ring-1 ring-border/50"
                )}>
                    {!displayContent ? renderThinkingToggle() : (
                        <div className="flex flex-col gap-2">
                            {displayContent && (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                                        code: ({ className, children, ...props }) => {
                                            const isInline = !className;
                                            const content = String(children).replace(/\n$/, '');

                                            if (isInline) {
                                                return (
                                                    <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground border border-border/50" {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            }

                                            return (
                                                <div className="relative group/code my-4">
                                                    <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity z-10">
                                                        <button
                                                            onClick={() => handleCopy(content)}
                                                            className="p-1.5 rounded-md bg-background/80 hover:bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground transition-all"
                                                            title="Copy code"
                                                        >
                                                            {copied === content ? (
                                                                <Check className="h-4 w-4 text-green-500" />
                                                            ) : (
                                                                <Copy className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                    </div>
                                                    <code className={cn('block bg-muted/50 p-4 rounded-xl overflow-x-auto border border-border/50 font-mono text-sm', className)} {...props}>
                                                        {children}
                                                    </code>
                                                </div>
                                            );
                                        },
                                        pre: ({ children }) => (
                                            <pre className="bg-transparent p-0 m-0 border-0 shadow-none">
                                                {children}
                                            </pre>
                                        ),
                                    }}
                                >
                                    {displayContent}
                                </ReactMarkdown>
                            )}
                            {displayContent && renderThinkingToggle()}
                        </div>
                    )}
                </div>

                {/* Action bar — only for completed assistant messages, when enabled in settings */}
                {!isUser && !isLoading && displayContent && preferences.showMessageActions && (
                    <MessageActions
                        content={displayContent}
                        onRegenerate={
                            preferences.enableRegenerate && onRegenerate
                                ? () => onRegenerate(message.id)
                                : undefined
                        }
                        isLoading={isLoading}
                    />
                )}
            </div>
        </div>
    );
}
