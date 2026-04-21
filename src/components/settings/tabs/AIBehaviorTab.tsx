'use client';

import { useState, useEffect } from 'react';
import { useChatPreferences } from '@/hooks/useChatPreferences';
import { Textarea, Button } from '@/components/ui';
import { Loader2, Check } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const PREBUILT_PROMPTS = [
    { label: 'None (Default)', value: 'none' },
    { label: 'Senior Developer', value: 'Act as a Senior Software Engineer. Provide concise, production-ready code without narrative fluff. Always prefer TypeScript and best practices.' },
    { label: 'Creative Writer', value: 'Act as an expert creative writer. Use highly evocative, descriptive language and focus on narrative flow.' },
    { label: 'Language Tutor', value: 'Act as a strict language tutor. Prioritize correcting my grammar explicitly before answering my questions.' },
    { label: 'Skeptical Reviewer', value: 'Act as a skeptical code reviewer. Always point out edge cases, security flaws, and performance bottlenecks in any code provided.' }
];

export function AIBehaviorTab() {
    const { preferences, updatePreference, isLoaded } = useChatPreferences();

    const [localPrompt, setLocalPrompt] = useState(preferences.systemPrompt);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (isLoaded) {
            setLocalPrompt(preferences.systemPrompt);
        }
    }, [isLoaded, preferences.systemPrompt]); // ensure localPrompt syncs when loaded

    useEffect(() => {
        if (!isSaving && preferences.systemPrompt !== localPrompt) {
            const isPrebuilt = PREBUILT_PROMPTS.some(p => p.value === preferences.systemPrompt);
            if (isPrebuilt || preferences.systemPrompt === '') {
                setLocalPrompt(preferences.systemPrompt);
            }
        }
    }, [preferences.systemPrompt, isSaving, localPrompt]);

    if (!isLoaded) {
        return (
            <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const prebuiltValue = preferences.systemPrompt === ''
        ? 'none'
        : (PREBUILT_PROMPTS.find(p => p.value === preferences.systemPrompt)?.value ?? 'custom');

    const handlePrebuiltChange = (val: string) => {
        if (val === 'none') {
            updatePreference('systemPrompt', '');
            updatePreference('isSystemPromptSafe', true);
            setLocalPrompt('');
        } else if (val !== 'custom') {
            updatePreference('systemPrompt', val);
            updatePreference('isSystemPromptSafe', true);
            setLocalPrompt(val);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaved(false);
        try {
            const res = await fetch('/api/settings/moderate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemPrompt: localPrompt }),
            });
            const data = await res.json();

            // Silently apply the safety check outcome.
            // If unsafe, it won't be appended before API calls in backend, 
            // but the user still saves their text and thinks everything is fine.
            updatePreference('systemPrompt', localPrompt);
            updatePreference('isSystemPromptSafe', !!data.safe);
        } catch (error) {
            console.error('Moderation error:', error);
            // Default to safe if our API boundary is broken, to prevent total block.
            updatePreference('systemPrompt', localPrompt);
            updatePreference('isSystemPromptSafe', true);
        } finally {
            setIsSaving(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 text-[14px]">

            <div className="space-y-4 pb-6 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-foreground font-medium">Pre-built profiles</h3>
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                            Select a ready-made persona for the AI to adopt.
                        </p>
                    </div>

                    <Select value={prebuiltValue} onValueChange={handlePrebuiltChange}>
                        <SelectTrigger className="w-[180px] h-9 text-[13px]">
                            <SelectValue placeholder="Select profile" />
                        </SelectTrigger>
                        <SelectContent className="text-[13px]">
                            {PREBUILT_PROMPTS.map((prompt) => (
                                <SelectItem key={prompt.label} value={prompt.value}>
                                    {prompt.label}
                                </SelectItem>
                            ))}
                            {prebuiltValue === 'custom' && (
                                <SelectItem value="custom">Custom</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-foreground font-medium">Custom instructions</h3>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        What would you like the AI to know about you to provide better responses? How would you like the AI to respond?
                    </p>
                </div>

                <Textarea
                    value={localPrompt}
                    onChange={(e) => setLocalPrompt(e.target.value)}
                    placeholder="Enter your custom instructions here..."
                    className="min-h-[160px] bg-transparent border-border hover:border-border/80 focus:border-primary text-[14px] resize-y p-3 rounded-lg"
                />

                <div className="flex justify-end pt-2">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || (localPrompt === preferences.systemPrompt)}
                        className="h-9 px-4 text-[13px] rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all flex items-center gap-2"
                    >
                        {isSaving ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                        ) : saved ? (
                            <><Check className="h-4 w-4" /> Saved</>
                        ) : (
                            'Save custom instructions'
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
