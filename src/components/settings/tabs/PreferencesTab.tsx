/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useChatPreferences } from '@/hooks/useChatPreferences';
import { Loader2, Command, CornerDownLeft } from 'lucide-react';

export function PreferencesTab() {
    const { preferences, updatePreference, isLoaded } = useChatPreferences();

    if (!isLoaded) {
        return (
            <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 text-[13px] pb-3">
            {/* Send Behavior */}
            <div className="space-y-2.5 pb-4 border-b border-border/50">
                <div>
                    <h3 className="text-[13px] text-foreground font-medium">Send message behavior</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        Choose what keyboard shortcut submits your message inside the chat box.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                        onClick={() => updatePreference('submitBehavior', 'enter')}
                        className={`flex flex-col items-start p-2.5 border rounded-lg transition-all text-left ${preferences.submitBehavior === 'enter'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-white/5'
                            }`}
                    >
                        <div className="flex items-center gap-1.5 mb-1">
                            <CornerDownLeft className={`h-3.5 w-3.5 ${preferences.submitBehavior === 'enter' ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="text-[12px] font-medium text-foreground">Enter</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">Pressing Enter sends. Shift+Enter inserts a new line.</p>
                    </button>

                    <button
                        onClick={() => updatePreference('submitBehavior', 'shift-enter')}
                        className={`flex flex-col items-start p-2.5 border rounded-lg transition-all text-left ${preferences.submitBehavior === 'shift-enter'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-white/5'
                            }`}
                    >
                        <div className="flex items-center gap-1.5 mb-1">
                            <Command className={`h-3.5 w-3.5 ${preferences.submitBehavior === 'shift-enter' ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="text-[12px] font-medium text-foreground">Cmd / Ctrl + Enter</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">Enter inserts a new line. Cmd/Ctrl + Enter sends.</p>
                    </button>
                </div>
            </div>

            {/* Text Size */}
            <div className="space-y-2.5">
                <div>
                    <h3 className="text-[13px] text-foreground font-medium">Chat font size</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        Adjust the size of the text within the AI generated chat bubbles.
                    </p>
                </div>

                <div className="flex gap-2">
                    {['small', 'normal', 'large'].map((size) => (
                        <button
                            key={size}
                            onClick={() => updatePreference('textSize', size as any)}
                            className={`flex-1 py-2 px-3 border rounded-lg transition-all text-center text-[12px] capitalize font-medium ${preferences.textSize === size
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-card hover:bg-white/5 text-foreground'
                                }`}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </div>

        </div>
    );
}
