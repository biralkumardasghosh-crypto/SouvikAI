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
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 text-[14px]">
            {/* Send Behavior */}
            <div className="space-y-4 pb-6 border-b border-border/50">
                <div>
                    <h3 className="text-foreground font-medium">Send message behavior</h3>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Choose what keyboard shortcut submits your message inside the chat box.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        onClick={() => updatePreference('submitBehavior', 'enter')}
                        className={`flex flex-col items-start p-4 border-2 rounded-xl transition-all text-left ${preferences.submitBehavior === 'enter'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-white/5'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <CornerDownLeft className={`h-4 w-4 ${preferences.submitBehavior === 'enter' ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="font-medium text-foreground">Enter</span>
                        </div>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">Pressing Enter sends the message. Use Shift+Enter for a new line.</p>
                    </button>

                    <button
                        onClick={() => updatePreference('submitBehavior', 'shift-enter')}
                        className={`flex flex-col items-start p-4 border-2 rounded-xl transition-all text-left ${preferences.submitBehavior === 'shift-enter'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-white/5'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Command className={`h-4 w-4 ${preferences.submitBehavior === 'shift-enter' ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="font-medium text-foreground">Cmd / Ctrl + Enter</span>
                        </div>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">Pressing Enter makes a new line. Cmd/Ctrl + Enter sends the message.</p>
                    </button>
                </div>
            </div>

            {/* Text Size */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-foreground font-medium">Chat font size</h3>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                        Adjust the size of the text within the AI generated chat bubbles.
                    </p>
                </div>

                <div className="flex gap-4">
                    {['small', 'normal', 'large'].map((size) => (
                        <button
                            key={size}
                            onClick={() => updatePreference('textSize', size as any)}
                            className={`flex-1 py-3 px-4 border-2 rounded-xl transition-all text-center capitalize font-medium ${preferences.textSize === size
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
