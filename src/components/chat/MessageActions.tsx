'use client';

import { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageActionsProps {
    /** The plain-text content to copy (think-tag-stripped). */
    content: string;
    /** Called when the user requests a regeneration of this response. */
    onRegenerate?: () => void;
    /** Hide the regenerate button while a response is already streaming. */
    isLoading?: boolean;
}

/**
 * Action bar rendered below every completed assistant message.
 * Shows on group-hover (opacity transition) so it stays out of the way
 * while reading but is immediately accessible on mouse-over.
 */
export function MessageActions({ content, onRegenerate, isLoading }: MessageActionsProps) {
    const [copied, setCopied] = useState(false);
    const [regenPending, setRegenPending] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard API unavailable — silently ignore.
        }
    };

    const handleRegenerate = async () => {
        if (!onRegenerate || isLoading || regenPending) return;
        setRegenPending(true);
        try {
            await onRegenerate();
        } finally {
            // The component will unmount when the message is removed, so this
            // is only a safety net for unexpected no-op scenarios.
            setRegenPending(false);
        }
    };

    return (
        <div className={cn(
            'flex items-center gap-0.5 mt-1',
            'opacity-0 group-hover:opacity-100',
            'transition-opacity duration-150',
        )}>
            {/* Copy button */}
            <button
                onClick={handleCopy}
                title={copied ? 'Copied!' : 'Copy response'}
                className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs',
                    'text-foreground-muted hover:text-foreground',
                    'hover:bg-surface-2 transition-colors',
                )}
            >
                {copied
                    ? <Check className="h-3.5 w-3.5 text-success" />
                    : <Copy className="h-3.5 w-3.5" />
                }
                <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Regenerate button — hidden while streaming */}
            {onRegenerate && (
                <button
                    onClick={handleRegenerate}
                    disabled={isLoading || regenPending}
                    title="Regenerate response"
                    className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs',
                        'text-foreground-muted hover:text-foreground',
                        'hover:bg-surface-2 transition-colors',
                        (isLoading || regenPending) && 'opacity-40 cursor-not-allowed',
                    )}
                >
                    <RefreshCw className={cn('h-3.5 w-3.5', regenPending && 'animate-spin')} />
                    <span>Regenerate</span>
                </button>
            )}
        </div>
    );
}
