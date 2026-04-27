'use client';

import { Code2, Lightbulb, BookOpen, Pencil, Globe, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Suggestion {
    icon: React.ElementType;
    label: string;
    /** Pre-fills the input with this text when the card is clicked. */
    prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
    {
        icon: Code2,
        label: 'Debug my code',
        prompt: "Help me debug the following code and explain what's wrong:\n\n",
    },
    {
        icon: Pencil,
        label: 'Write something',
        prompt: 'Write a compelling ',
    },
    {
        icon: Lightbulb,
        label: 'Brainstorm ideas',
        prompt: 'Brainstorm 10 creative ideas for ',
    },
    {
        icon: BookOpen,
        label: 'Explain a concept',
        prompt: 'Explain in simple terms: ',
    },
    {
        icon: Globe,
        label: 'Translate text',
        prompt: 'Translate the following text to ',
    },
    {
        icon: Sparkles,
        label: 'Improve my writing',
        prompt: 'Improve and polish the following text while keeping the original meaning:\n\n',
    },
];

interface PromptSuggestionsProps {
    /** Called with the prompt text when a card is clicked. */
    onSelect: (prompt: string) => void;
}

/**
 * A grid of quick-start cards shown on the empty chat screen.
 * Clicking a card pre-fills the chat input with the associated prompt
 * so the user can edit it before sending.
 */
export function PromptSuggestions({ onSelect }: PromptSuggestionsProps) {
    return (
        <div className="w-full max-w-[640px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SUGGESTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                        <button
                            key={s.label}
                            onClick={() => onSelect(s.prompt)}
                            className={cn(
                                'group flex flex-col items-start gap-2 p-3 rounded-2xl',
                                'border border-border bg-surface',
                                'hover:border-border-strong hover:bg-surface-2',
                                'transition-all duration-200 text-left',
                                'active:scale-[0.97]',
                            )}
                        >
                            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-surface-2 group-hover:bg-surface-3 transition-colors">
                                <Icon className="h-4 w-4 text-foreground-muted group-hover:text-foreground transition-colors" />
                            </span>
                            <span className="text-xs font-medium text-foreground-muted group-hover:text-foreground transition-colors leading-snug">
                                {s.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
