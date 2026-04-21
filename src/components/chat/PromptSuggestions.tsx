'use client';

import { Code2, Lightbulb, BookOpen, Pencil, Globe, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Suggestion {
    icon: React.ElementType;
    label: string;
    /** Pre-fills the input with this text when the card is clicked. */
    prompt: string;
    gradient: string;
}

const SUGGESTIONS: Suggestion[] = [
    {
        icon: Code2,
        label: 'Debug my code',
        prompt: "Help me debug the following code and explain what's wrong:\n\n",
        gradient: 'from-violet-500/10 to-purple-500/5',
    },
    {
        icon: Pencil,
        label: 'Write something',
        prompt: 'Write a compelling ',
        gradient: 'from-blue-500/10 to-cyan-500/5',
    },
    {
        icon: Lightbulb,
        label: 'Brainstorm ideas',
        prompt: 'Brainstorm 10 creative ideas for ',
        gradient: 'from-yellow-500/10 to-orange-500/5',
    },
    {
        icon: BookOpen,
        label: 'Explain a concept',
        prompt: 'Explain in simple terms: ',
        gradient: 'from-emerald-500/10 to-green-500/5',
    },
    {
        icon: Globe,
        label: 'Translate text',
        prompt: 'Translate the following text to ',
        gradient: 'from-pink-500/10 to-rose-500/5',
    },
    {
        icon: Sparkles,
        label: 'Improve my writing',
        prompt: 'Improve and polish the following text while keeping the original meaning:\n\n',
        gradient: 'from-indigo-500/10 to-blue-500/5',
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
                                'border border-white/[0.08]',
                                'bg-gradient-to-br',
                                s.gradient,
                                'hover:border-white/15 hover:bg-white/5',
                                'transition-all duration-200 text-left',
                                'active:scale-[0.97]',
                            )}
                        >
                            <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </span>
                            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-snug">
                                {s.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
