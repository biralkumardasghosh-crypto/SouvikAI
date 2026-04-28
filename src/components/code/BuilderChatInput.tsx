'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModelSelector } from '@/components/chat/ModelSelector';
import type { AIModel } from '@/types/chat';

interface BuilderChatInputProps {
    /** Variant: "compact" inside the workspace, "centered" on the /code landing page. */
    variant?: 'centered' | 'compact';
    placeholder?: string;
    isStreaming?: boolean;
    disabled?: boolean;
    /** Initial value (used to seed the textarea, e.g. an editable suggestion). */
    initialValue?: string;
    onSend: (message: string) => void;
    onStop?: () => void;
    /** When omitted, no model selector is shown. */
    models?: AIModel[];
    selectedModelId?: string;
    onModelChange?: (id: string) => void;
    autoFocus?: boolean;
}

export function BuilderChatInput({
    variant = 'compact',
    placeholder = 'Ask Forge to create or change something…',
    isStreaming,
    disabled,
    initialValue = '',
    onSend,
    onStop,
    models,
    selectedModelId,
    onModelChange,
    autoFocus,
}: BuilderChatInputProps) {
    const [value, setValue] = useState(initialValue);
    const taRef = useRef<HTMLTextAreaElement>(null);

    // Auto-grow textarea up to a max height.
    useLayoutEffect(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        const max = variant === 'centered' ? 220 : 160;
        ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
    }, [value, variant]);

    useEffect(() => {
        if (autoFocus) taRef.current?.focus();
    }, [autoFocus]);

    const trimmed = value.trim();
    const canSend = trimmed.length > 0 && !isStreaming && !disabled;

    const handleSubmit = () => {
        if (!canSend) return;
        onSend(trimmed);
        setValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const wrapperPadding = variant === 'centered' ? 'p-3' : 'p-2.5';

    return (
        <div
            className={cn(
                'relative flex flex-col rounded-2xl bg-surface border border-border shadow-sm',
                'focus-within:border-border-strong transition-colors',
                wrapperPadding,
            )}
        >
            <textarea
                ref={taRef}
                rows={variant === 'centered' ? 2 : 1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={placeholder}
                className={cn(
                    'w-full resize-none border-0 bg-transparent px-1.5 py-1.5',
                    'text-foreground placeholder:text-foreground-subtle',
                    'focus:outline-none focus:ring-0',
                    variant === 'centered' ? 'text-[15px] min-h-[56px]' : 'text-[14px] min-h-[40px]',
                )}
            />

            <div className="mt-1 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1 min-w-0">
                    {models && selectedModelId && onModelChange && (
                        <ModelSelector
                            models={models}
                            value={selectedModelId}
                            onValueChange={onModelChange}
                            disabled={isStreaming}
                        />
                    )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {isStreaming ? (
                        <button
                            type="button"
                            onClick={onStop}
                            aria-label="Stop generation"
                            className={cn(
                                'inline-flex items-center justify-center h-9 w-9 rounded-full',
                                'bg-foreground text-background hover:bg-foreground/90 transition-colors',
                            )}
                        >
                            <Square className="h-3.5 w-3.5 fill-current" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!canSend}
                            aria-label="Send message"
                            className={cn(
                                'inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors',
                                canSend
                                    ? 'bg-foreground text-background hover:bg-foreground/90'
                                    : 'bg-surface-3 text-foreground-subtle cursor-not-allowed',
                            )}
                        >
                            {disabled ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <ArrowUp className="h-4 w-4" />
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
