'use client';

import { useState, useEffect } from 'react';

export interface ChatPreferences {
    submitBehavior: 'enter' | 'shift-enter';
    textSize: 'small' | 'normal' | 'large';
    systemPrompt: string;
    isSystemPromptSafe: boolean;
    /** Show Copy / Regenerate action bar below assistant messages. */
    showMessageActions: boolean;
    /** Show quick-start suggestion cards on the empty chat screen. */
    showPromptSuggestions: boolean;
    /** Allow one-click regeneration of assistant responses. */
    enableRegenerate: boolean;
    /** UI colour theme — mirrors next-themes values. */
    theme: 'light' | 'dark' | 'system';
    /** Visual contrast level applied via a CSS filter. */
    contrast: 'standard' | 'medium' | 'high';
    /** Accent / primary colour used across interactive elements. */
    accentColor: 'blue' | 'purple' | 'green' | 'orange' | 'rose' | 'slate';
    /** Display language preference (stored; i18n implementation is out of scope). */
    language: string;
}

const DEFAULT_PREFERENCES: ChatPreferences = {
    submitBehavior: 'enter',
    textSize: 'normal',
    systemPrompt: '',
    isSystemPromptSafe: true,
    showMessageActions: true,
    showPromptSuggestions: false,
    enableRegenerate: true,
    theme: 'dark',
    contrast: 'standard',
    accentColor: 'blue',
    language: 'en-US',
};


export function useChatPreferences() {
    const [preferences, setPreferences] = useState<ChatPreferences>(DEFAULT_PREFERENCES);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const loadPreferences = () => {
            try {
                const saved = localStorage.getItem('souvik-ai-chat-preferences');
                if (saved) {
                    setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
                }
            } catch (e) {
                console.error('Failed to load chat preferences', e);
            }
        };

        loadPreferences();
        setIsLoaded(true);

        // Listen for standard cross-tab storage changes
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'souvik-ai-chat-preferences') {
                loadPreferences();
            }
        };

        // Listen for our custom event (for cross-component, same-tab communication)
        const handleCustomEvent = (e: Event) => {
            const customEvent = e as CustomEvent<ChatPreferences>;
            setPreferences(customEvent.detail);
        };

        window.addEventListener('storage', handleStorage);
        window.addEventListener('chat-preferences-updated', handleCustomEvent);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('chat-preferences-updated', handleCustomEvent);
        };
    }, []);

    const updatePreference = <K extends keyof ChatPreferences>(key: K, value: ChatPreferences[K]) => {
        setPreferences((prev) => {
            const updated = { ...prev, [key]: value };
            try {
                localStorage.setItem('souvik-ai-chat-preferences', JSON.stringify(updated));
                // Dispatch event so other components using this hook instantly reflect the change
                window.dispatchEvent(
                    new CustomEvent('chat-preferences-updated', { detail: updated })
                );
            } catch (e) {
                console.error('Failed to save chat preferences', e);
            }
            return updated;
        });
    };

    return { preferences, updatePreference, isLoaded };
}
