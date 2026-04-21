'use client';

/**
 * GeneralTab — Settings → General
 *
 * Owns all visual + behavioural preferences that were previously split across
 * AppearanceTab and individual feature flags:
 *
 *  - Appearance  (theme: Dark / Light / System)
 *  - Contrast    (Standard / Medium / High)
 *  - Accent color (Blue / Purple / Green / Orange / Rose / Slate)
 *  - Language    (display language — stored, not yet wired to i18n)
 *  - Message action bar  (show + enable-regenerate toggles)
 *  - Prompt suggestions  (show toggle)
 */

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Loader2, RefreshCw, Copy, Sparkles } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useChatPreferences } from '@/hooks/useChatPreferences';
import { cn } from '@/lib/utils';

// ─── Accent colour palette ──────────────────────────────────────────────────

const ACCENT_COLORS = [
    { id: 'blue',   label: 'Blue',   hsl: '217 91% 60%', hex: '#3B82F6' },
    { id: 'purple', label: 'Purple', hsl: '262 80% 65%', hex: '#9B59F5' },
    { id: 'green',  label: 'Green',  hsl: '142 71% 45%', hex: '#22C55E' },
    { id: 'orange', label: 'Orange', hsl: '25 95% 53%',  hex: '#F97316' },
    { id: 'rose',   label: 'Rose',   hsl: '347 77% 60%', hex: '#F43F5E' },
    { id: 'slate',  label: 'Slate',  hsl: '220 14% 60%', hex: '#8B98B1' },
] as const;

const LANGUAGES = [
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'hi',    label: 'Hindi' },
    { value: 'es',    label: 'Spanish' },
    { value: 'fr',    label: 'French' },
    { value: 'de',    label: 'German' },
    { value: 'ja',    label: 'Japanese' },
    { value: 'zh-CN', label: 'Chinese (Simplified)' },
    { value: 'pt-BR', label: 'Portuguese (Brazil)' },
    { value: 'ar',    label: 'Arabic' },
];

// ─── Reusable primitives ────────────────────────────────────────────────────

/** Horizontal rule that separates setting rows inside a card section. */
function RowDivider() {
    return <div className="h-px bg-border/40 mx-0" />;
}

interface SettingRowProps {
    label: string;
    description?: string;
    control: React.ReactNode;
}

/**
 * Single setting row: label+description on the left, control on the right.
 * Matches the screenshot's list-item style.
 */
function SettingRow({ label, description, control }: SettingRowProps) {
    return (
        <div className="flex items-center justify-between gap-6 px-4 py-3.5 min-h-[56px]">
            <div className="min-w-0 flex-1">
                <p className="text-[14px] font-normal text-foreground leading-none">{label}</p>
                {description && (
                    <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed max-w-sm">
                        {description}
                    </p>
                )}
            </div>
            <div className="shrink-0 flex items-center">{control}</div>
        </div>
    );
}

/** Accessible pill toggle matching the screenshot style. */
function Toggle({
    id,
    checked,
    onChange,
    disabled,
}: {
    id: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                'transition-colors duration-200 ease-in-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                checked ? 'bg-white' : 'bg-white/20',
                disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
            )}
        >
            <span
                className={cn(
                    'pointer-events-none block h-[18px] w-[18px] rounded-full shadow-sm',
                    'transform transition-transform duration-200 ease-in-out',
                    checked ? 'translate-x-[18px] bg-black' : 'translate-x-0 bg-white/70',
                )}
            />
        </button>
    );
}

/** Compact Radix Select styled to look like the reference screenshot. */
function SettingsSelect({
    value,
    onValueChange,
    options,
    width = 'w-[160px]',
}: {
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
    width?: string;
}) {
    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger
                className={cn(
                    width,
                    'h-8 text-[13px] bg-transparent border-border/50 text-foreground',
                    'hover:bg-white/5 focus:ring-0 focus:ring-offset-0',
                )}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-border/50">
                {options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-[13px]">
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** Accent-colour select that shows a colour swatch next to the label. */
function AccentColorSelect({
    value,
    onValueChange,
}: {
    value: string;
    onValueChange: (v: string) => void;
}) {
    const current = ACCENT_COLORS.find((c) => c.id === value) ?? ACCENT_COLORS[0];

    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger
                className={cn(
                    'w-[160px] h-8 text-[13px] bg-transparent border-border/50 text-foreground',
                    'hover:bg-white/5 focus:ring-0 focus:ring-offset-0',
                )}
            >
                <span className="flex items-center gap-2">
                    <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: current.hex }}
                    />
                    <SelectValue />
                </span>
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-border/50">
                {ACCENT_COLORS.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-[13px]">
                        <span className="flex items-center gap-2">
                            <span
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: c.hex }}
                            />
                            {c.label}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** A visual card container that groups related settings rows. */
function SettingsCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden divide-y divide-border/30">
            {children}
        </div>
    );
}

/** Section label above a card — matches reference screenshot's section titles. */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-0.5 pt-6 pb-2 first:pt-0">
            {children}
        </p>
    );
}

// ─── Main tab ───────────────────────────────────────────────────────────────

export function GeneralTab() {
    const { preferences, updatePreference, isLoaded } = useChatPreferences();
    const { setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    // Sync theme preference → next-themes
    useEffect(() => {
        if (mounted && isLoaded) {
            setTheme(preferences.theme);
        }
    }, [preferences.theme, mounted, isLoaded, setTheme]);

    // Apply accent colour as a CSS variable on :root
    useEffect(() => {
        if (!mounted || !isLoaded) return;
        const color = ACCENT_COLORS.find((c) => c.id === preferences.accentColor);
        if (color) {
            document.documentElement.style.setProperty('--primary', color.hsl);
            document.documentElement.style.setProperty('--ring', color.hsl);
        }
    }, [preferences.accentColor, mounted, isLoaded]);

    // Apply contrast as a CSS filter on the root element
    useEffect(() => {
        if (!mounted || !isLoaded) return;
        const filterMap: Record<string, string> = {
            standard: 'none',
            medium:   'contrast(1.08) saturate(1.05)',
            high:     'contrast(1.2)  saturate(1.1)',
        };
        document.documentElement.style.filter = filterMap[preferences.contrast] ?? 'none';
        return () => {
            document.documentElement.style.filter = 'none';
        };
    }, [preferences.contrast, mounted, isLoaded]);

    if (!isLoaded || !mounted) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-4">

            {/* ── Display ─────────────────────────────────────────────────── */}
            <SectionLabel>Display</SectionLabel>
            <SettingsCard>
                <SettingRow
                    label="Appearance"
                    control={
                        <SettingsSelect
                            value={preferences.theme}
                            onValueChange={(v) =>
                                updatePreference('theme', v as 'light' | 'dark' | 'system')
                            }
                            options={[
                                { value: 'dark',   label: 'Dark' },
                                { value: 'light',  label: 'Light' },
                                { value: 'system', label: 'System' },
                            ]}
                        />
                    }
                />
                <RowDivider />
                <SettingRow
                    label="Contrast"
                    control={
                        <SettingsSelect
                            value={preferences.contrast}
                            onValueChange={(v) =>
                                updatePreference('contrast', v as 'standard' | 'medium' | 'high')
                            }
                            options={[
                                { value: 'standard', label: 'Standard' },
                                { value: 'medium',   label: 'Medium' },
                                { value: 'high',     label: 'High' },
                            ]}
                        />
                    }
                />
                <RowDivider />
                <SettingRow
                    label="Accent color"
                    control={
                        <AccentColorSelect
                            value={preferences.accentColor}
                            onValueChange={(v) =>
                                updatePreference(
                                    'accentColor',
                                    v as 'blue' | 'purple' | 'green' | 'orange' | 'rose' | 'slate',
                                )
                            }
                        />
                    }
                />
            </SettingsCard>

            {/* ── Localisation ────────────────────────────────────────────── */}
            <SectionLabel>Localisation</SectionLabel>
            <SettingsCard>
                <SettingRow
                    label="Language"
                    control={
                        <SettingsSelect
                            value={preferences.language}
                            onValueChange={(v) => updatePreference('language', v)}
                            options={LANGUAGES}
                            width="w-[180px]"
                        />
                    }
                />
            </SettingsCard>

            {/* ── Message Actions ─────────────────────────────────────────── */}
            <SectionLabel>Message Actions</SectionLabel>
            <SettingsCard>
                <SettingRow
                    label="Show action bar"
                    description="Display Copy and Regenerate buttons below every AI response on hover."
                    control={
                        <Toggle
                            id="toggle-show-message-actions"
                            checked={preferences.showMessageActions}
                            onChange={(v) => updatePreference('showMessageActions', v)}
                        />
                    }
                />
                <SettingRow
                    label="Enable Regenerate"
                    description={
                        preferences.showMessageActions
                            ? 'Allow re-running an assistant response with a single click.'
                            : 'Enable the action bar above to use this setting.'
                    }
                    control={
                        <Toggle
                            id="toggle-enable-regenerate"
                            checked={preferences.enableRegenerate}
                            onChange={(v) => updatePreference('enableRegenerate', v)}
                            disabled={!preferences.showMessageActions}
                        />
                    }
                />
                {!preferences.showMessageActions && (
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.02]">
                        <RefreshCw className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        <p className="text-[11.5px] text-muted-foreground/50">
                            Regenerate is unavailable while the action bar is hidden.
                        </p>
                    </div>
                )}
            </SettingsCard>

            {/* ── Prompt Suggestions ──────────────────────────────────────── */}
            <SectionLabel>Prompt Suggestions</SectionLabel>
            <SettingsCard>
                <SettingRow
                    label="Show suggestion cards"
                    description="Display quick-start prompt cards when no conversation is active. Clicking a card pre-fills the input."
                    control={
                        <Toggle
                            id="toggle-show-prompt-suggestions"
                            checked={preferences.showPromptSuggestions}
                            onChange={(v) => updatePreference('showPromptSuggestions', v)}
                        />
                    }
                />
                {!preferences.showPromptSuggestions && (
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.02]">
                        <Sparkles className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        <p className="text-[11.5px] text-muted-foreground/50">
                            The input box will still appear — only the suggestion cards are hidden.
                        </p>
                    </div>
                )}
            </SettingsCard>

        </div>
    );
}
