'use client';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui';
import { AIModel } from '@/types/chat';
import { ChevronDown, Sparkles } from 'lucide-react';

interface ModelSelectorProps {
    disabled?: boolean;
    value: string;
    onValueChange: (value: string) => void;
    models: AIModel[];
}

export function ModelSelector({ disabled, value, onValueChange, models }: ModelSelectorProps) {
    const selectedModel = models.find(m => m.id === value);

    return (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger className="w-auto gap-1 border-0 bg-transparent hover:bg-surface-2 transition-colors px-2 py-1.5 h-auto focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-surface-2 rounded-xl group">
                <div className="flex items-center gap-1.5">
                    <span className="text-base font-semibold text-foreground group-hover:text-foreground/90 transition-colors">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {value === 'auto' ? 'SouvikAI' : (selectedModel?.displayName || (selectedModel as any)?.display_name || 'SouvikAI')}
                    </span>
                    <span className="text-sm text-foreground-muted font-normal">
                        {value === 'auto' ? 'Auto' : ''}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-foreground-subtle" />
                </div>
            </SelectTrigger>
            <SelectContent align="start" className="w-[200px] bg-popover text-popover-foreground border-border">
                <SelectItem
                    value="auto"
                    className="cursor-pointer focus:bg-surface-2 text-sm my-0.5"
                >
                    <div className="flex items-center gap-2">
                        Auto
                    </div>
                </SelectItem>
                {models.map((model) => (
                    <SelectItem
                        key={model.id}
                        value={model.id}
                        className="cursor-pointer focus:bg-surface-2 text-sm my-0.5"
                    >
                        <div className="flex items-center gap-2">
                            {model.id.includes('pro') && <Sparkles className="h-3 w-3 text-warning" />}
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {model.displayName || (model as any).display_name || model.id}
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
