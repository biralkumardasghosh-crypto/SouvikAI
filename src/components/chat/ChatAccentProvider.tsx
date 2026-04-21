'use client';

/**
 * ChatAccentProvider
 *
 * Applies the user's chosen accent colour as a CSS custom property scoped to
 * the chat surface — never to `:root`, so login/signup pages are unaffected.
 *
 * The variable `--send-btn` is read by the send-message buttons in
 * ChatInput and ChatContainer.  It is intentionally different from the Tailwind
 * `--primary` variable so only explicitly opted-in elements are coloured.
 *
 * Usage: wrap the chat page (not the auth layout) with this component.
 */

import { useEffect, useRef } from 'react';
import { useChatPreferences } from '@/hooks/useChatPreferences';

// Hex values for each accent option — used to set the CSS variable.
const ACCENT_HEX: Record<string, string> = {
    blue:   '#3B82F6',
    purple: '#9B59F5',
    green:  '#22C55E',
    orange: '#F97316',
    rose:   '#F43F5E',
    slate:  '#8B98B1',
};

// Hover-darkened variants (roughly 10-15 % darker) for the send button.
const ACCENT_HOVER_HEX: Record<string, string> = {
    blue:   '#2563EB',
    purple: '#7C3AED',
    green:  '#16A34A',
    orange: '#EA6C00',
    rose:   '#E11D48',
    slate:  '#64748B',
};

interface ChatAccentProviderProps {
    children: React.ReactNode;
}

export function ChatAccentProvider({ children }: ChatAccentProviderProps) {
    const { preferences } = useChatPreferences();
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = divRef.current;
        if (!el) return;

        const hex      = ACCENT_HEX[preferences.accentColor]      ?? ACCENT_HEX.blue;
        const hoverHex = ACCENT_HOVER_HEX[preferences.accentColor] ?? ACCENT_HOVER_HEX.blue;

        el.style.setProperty('--send-btn',       hex);
        el.style.setProperty('--send-btn-hover',  hoverHex);
    }, [preferences.accentColor]);

    return (
        // data-chat-surface lets CSS selectors target this scope specifically.
        <div ref={divRef} data-chat-surface className="flex h-screen bg-[#212121] overflow-hidden">
            {children}
        </div>
    );
}
