'use client';

import { Avatar, AvatarFallback } from '@/components/ui';
import { useChatPreferences } from '@/hooks/useChatPreferences';
import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { Sparkles, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { MessageActions } from './MessageActions';
import { ThinkingTimeline } from './ThinkingTimeline';
import { MessageAttachments } from './MessageAttachments';
// Prism renderer — smaller bundle than highlight.js, better language auto-detection
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a Date as a human-readable timestamp string.
 * Today → time only (e.g. "3:42 PM"); older → date + time.
 */
function formatTimestamp(date: Date): string {
    const now = new Date();
    const isToday =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    if (isToday) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' · ' +
        date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Detects the language from a fenced-code className like "language-typescript".
 * Falls back to "text" so SyntaxHighlighter still renders cleanly.
 */
function extractLang(className?: string): string {
    if (!className) return 'text';
    const match = className.match(/language-(\w+)/);
    return match?.[1] ?? 'text';
}

// ── Component ─────────────────────────────────────────────────────────────────

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
    const hasWebSearch = !isUser && !!message.webSearch;
    // Show the timeline whenever the assistant has any reasoning artifact —
    // active thinking, completed thoughts, a web-search step, or just the
    // initial waiting-for-first-token loading state.
    const showTimeline = !isUser && (
        hasWebSearch ||
        hasThought ||
        isThinking ||
        (!!isLoading && !displayContent)
    );

    // ── Timestamp ─────────────────────────────────────────────────────────────
    const timestampLabel = message.createdAt instanceof Date && !isNaN(message.createdAt.getTime())
        ? formatTimestamp(message.createdAt)
        : '';

    // ── Prose styling shared by both roles, but tuned per role ────────────────
    const proseClasses = cn(
        'prose prose-invert max-w-none',
        preferences.textSize === 'small' ? 'prose-sm text-[13px]' :
            preferences.textSize === 'large' ? 'prose-base text-[17px]' : 'prose-sm text-[15px]',
        'leading-7',
        // Paragraphs
        'prose-p:text-foreground/90 prose-p:my-3 prose-p:leading-7',
        // Headings — tighter, more deliberate hierarchy
        'prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3',
        'prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-1.5 prose-h2:border-b prose-h2:border-border/40',
        'prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2',
        'prose-h4:text-sm prose-h4:mt-4 prose-h4:mb-2 prose-h4:uppercase prose-h4:tracking-wider prose-h4:text-muted-foreground',
        // Strong / emphasis
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-em:text-foreground/90',
        // Links
        'prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4',
        // Lists — tighter spacing
        'prose-ul:my-3 prose-ol:my-3 prose-ul:pl-5 prose-ol:pl-5',
        'prose-li:my-1 prose-li:text-foreground/90 prose-li:leading-7',
        'prose-li:marker:text-muted-foreground/60',
        // Blockquotes — accent stripe
        'prose-blockquote:border-l-2 prose-blockquote:border-primary/60 prose-blockquote:bg-muted/30',
        'prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:my-4',
        'prose-blockquote:not-italic prose-blockquote:text-foreground/85 prose-blockquote:rounded-r',
        // Horizontal rule
        'prose-hr:my-6 prose-hr:border-border/40',
        // Code (handled fully below, but reset wrapper styles)
        'prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-pre:border-0 prose-pre:shadow-none',
        // Tables — refined borders
        'prose-table:border-collapse prose-table:w-full prose-table:my-4 prose-table:overflow-hidden prose-table:rounded-lg prose-table:border prose-table:border-border/50',
        'prose-thead:bg-muted/40',
        'prose-th:border prose-th:border-border/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-foreground prose-th:text-sm',
        'prose-td:border prose-td:border-border/40 prose-td:px-3 prose-td:py-2 prose-td:text-foreground/90 prose-td:text-sm',
        'prose-tr:even:bg-muted/15',
    );

    // ── Markdown component overrides — same for both roles ───────────────────
    const markdownComponents = {
        // ── Inline + fenced code ──────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code: ({ className, children, ...props }: any) => {
            const lang = extractLang(className);
            const isInline = !className;
            const content = String(children).replace(/\n$/, '');

            if (isInline) {
                return (
                    <code
                        className="bg-muted px-1.5 py-0.5 rounded text-[0.85em] font-mono text-foreground border border-border/50"
                        {...props}
                    >
                        {children}
                    </code>
                );
            }

            return (
                <div className="relative group/code my-4 rounded-xl overflow-hidden border border-border/50 shadow-sm">
                    <div className="flex items-center justify-between px-4 py-2 bg-[#1d1f21] border-b border-border/40">
                        <span className="text-[11px] font-mono text-muted-foreground/70 uppercase tracking-widest select-none">
                            {lang === 'text' ? 'plaintext' : lang}
                        </span>
                        <button
                            onClick={() => handleCopy(content)}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
                            title="Copy code"
                        >
                            {copied === content ? (
                                <><Check className="h-3 w-3 text-green-500" />Copied</>
                            ) : (
                                <><Copy className="h-3 w-3" />Copy</>
                            )}
                        </button>
                    </div>

                    <SyntaxHighlighter
                        language={lang}
                        style={oneDark}
                        customStyle={{
                            margin: 0,
                            padding: '1rem',
                            background: '#1d1f21',
                            fontSize: '0.8125rem',
                            lineHeight: '1.6',
                            borderRadius: 0,
                        }}
                        codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
                        wrapLongLines={false}
                    >
                        {content}
                    </SyntaxHighlighter>
                </div>
            );
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pre: ({ children }: any) => (
            <pre className="bg-transparent p-0 m-0 border-0 shadow-none">
                {children}
            </pre>
        ),
        // Wrap tables in a horizontal scroll container so they never overflow on mobile
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        table: ({ children }: any) => (
            <div className="my-4 w-full overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full border-collapse text-sm">{children}</table>
            </div>
        ),
    };

    // ─────────────────────────────────────────────────────────────────────────
    // USER MESSAGE — right-aligned bubble, more compact
    // ─────────────────────────────────────────────────────────────────────────
    if (isUser) {
        const hasAttachments = !!message.attachments && message.attachments.length > 0;
        const hasText = message.content.trim().length > 0;
        return (
            <div className="group flex flex-col items-end gap-1.5 px-2 md:px-4 py-1 animate-fade-in mx-1 md:mx-2">
                {hasAttachments && (
                    <MessageAttachments attachments={message.attachments!} />
                )}
                {hasText && (
                    <div
                        className={cn(
                            'max-w-[88%] md:max-w-[75%] rounded-2xl rounded-tr-md px-4 py-2.5',
                            'bg-secondary text-secondary-foreground border border-border/40 shadow-sm',
                            'whitespace-pre-wrap break-words',
                            preferences.textSize === 'small' ? 'text-[13px]' :
                                preferences.textSize === 'large' ? 'text-[17px]' : 'text-[15px]',
                            'leading-6',
                        )}
                    >
                        {message.content}
                    </div>
                )}
                {timestampLabel && (
                    <span className="text-[10px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 select-none mr-2">
                        {timestampLabel}
                    </span>
                )}
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ASSISTANT MESSAGE — full width, structured canvas
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="group flex gap-3 md:gap-4 px-2 md:px-4 py-3 animate-fade-in mx-1 md:mx-2 rounded-xl">
            <Avatar className="h-8 w-8 shrink-0 shadow-sm border border-border/50 bg-gradient-to-br from-primary/15 to-primary/5">
                <AvatarFallback className="bg-transparent text-primary">
                    <Sparkles className="h-4 w-4" strokeWidth={2.25} />
                </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 space-y-1.5">
                {/* Header row: name + timestamp */}
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground tracking-tight">
                        Souvik&apos;s AI
                    </p>
                    {timestampLabel && (
                        <span className="text-[11px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 select-none">
                            {timestampLabel}
                        </span>
                    )}
                </div>

                {/* Reasoning timeline (think blocks + web search) */}
                {showTimeline && (
                    <ThinkingTimeline
                        thinkContent={thinkContent}
                        isThinking={isThinking}
                        isLoading={!!isLoading}
                        webSearch={message.webSearch}
                    />
                )}

                {/* Markdown body */}
                {displayContent && (
                    <div className={cn(proseClasses, isLoading && 'streaming-caret')}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {displayContent}
                        </ReactMarkdown>
                    </div>
                )}

                {/* Action bar — only for completed assistant messages */}
                {!isLoading && displayContent && preferences.showMessageActions && (
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
