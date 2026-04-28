'use client';

import { Code2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkspaceView = 'editor' | 'preview';

interface ViewToggleProps {
    value: WorkspaceView;
    onChange: (next: WorkspaceView) => void;
}

/**
 * Segmented switch shown above the right pane. Toggles between the file
 * editor and the live preview iframe.
 */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
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
        </div>
    );
}

function ToggleButton({
    active,
    onClick,
    icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
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
                    : 'text-foreground-muted hover:text-foreground',
            )}
        >
            {icon}
            {label}
        </button>
    );
}
