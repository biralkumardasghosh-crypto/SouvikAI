'use client';

import { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
    confirmVariant?: 'danger' | 'warning';
}

export function ConfirmModal({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = 'Confirm',
    confirmVariant = 'danger',
}: ConfirmModalProps) {
    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            {/* Panel — stop propagation so clicking inside doesn't close */}
            <div
                className="w-full max-w-[380px] bg-popover text-popover-foreground rounded-2xl border border-border shadow-overlay overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between p-5 pb-3">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                            confirmVariant === 'danger' ? 'bg-destructive/15' : 'bg-warning/15'
                        )}>
                            <AlertTriangle className={cn(
                                'h-4 w-4',
                                confirmVariant === 'danger' ? 'text-destructive' : 'text-warning'
                            )} />
                        </div>
                        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-foreground-muted hover:text-foreground transition-colors p-1 rounded-md hover:bg-surface-2"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <p className="px-5 pb-5 text-sm text-foreground-muted leading-relaxed">
                    {description}
                </p>

                {/* Actions */}
                <div className="flex gap-2 px-5 pb-5">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-surface-2 hover:bg-surface-3 text-foreground-muted hover:text-foreground transition-colors border border-border"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={cn(
                            'flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                            confirmVariant === 'danger'
                                ? 'bg-destructive/15 hover:bg-destructive/25 text-destructive border border-destructive/30'
                                : 'bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30'
                        )}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
