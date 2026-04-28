'use client';

import { Code2, Eye, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkspaceView = 'editor' | 'preview' | 'review';

interface ViewToggleProps {
    value: WorkspaceView;
    onChange: (next: WorkspaceView) => void;
    /**
     * Number of pending changes that need review. When > 0 a "Review"
     * tab appears with a count badge so the user can spot AI-proposed
     * changes at a glance.
     */
    reviewCount?: number;
}

/**
 * Segmented switch shown above the right pane. Toggles between the file
 * editor, the live preview, and (when there are pending changes) the
 * diff review surface.
 */
export function ViewToggle({ value, onChange, reviewCount = 0 }: ViewToggleProps) {
    return (
        <div className="inline-flex items-center rounded-lg bg-surface-2 p-0.5 border border-border-subtle">
            <ToggleButton
                active={value === 'editor'}
                onClick={() => onChange('editor')}
                icon={<Code2 className="h-3.5 w-3.5" />}
                label="Editor"
            />
            <ToggleButton
                active={value === 'preview'}
                onClick={() => onChange('preview')}
                icon={<Eye className="h-3.5 w-3.5" />}
                label="Preview"
            />
            {reviewCount > 0 && (
                <ToggleButton
                    active={value === 'review'}
                    onClick={() => onChange('review')}
                    icon={<GitCompare className="h-3.5 w-3.5" />}
                    label="Review"
                    badge={reviewCount}
                    tone="attention"
                />
            )}
        </div>
    );
}

function ToggleButton({
    active,
    onClick,
    icon,
    label,
    badge,
    tone = 'neutral',
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    badge?: number;
    tone?: 'neutral' | 'attention';
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors',
                active
                    ? 'bg-background text-foreground shadow-sm'
                    : tone === 'attention'
                      ? 'text-amber-600 dark:text-amber-400 hover:text-foreground'
                      : 'text-foreground-muted hover:text-foreground',
            )}
        >
            {icon}
            {label}
            {badge != null && badge > 0 && (
                <span
                    className={cn(
                        'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                        active
                            ? 'bg-foreground text-background'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                    )}
                >
                    {badge}
                </span>
            )}
        </button>
    );
}
