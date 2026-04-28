'use client';

import { useEffect, useRef, useState } from 'react';
import { X, FolderPlus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectModalProps {
    open: boolean;
    mode: 'create' | 'rename';
    /** Initial value for rename mode; ignored for create. */
    initialName?: string;
    onClose: () => void;
    onSubmit: (name: string) => void | Promise<void>;
}

const MAX_NAME = 120;

/**
 * Compact modal for creating a new project or renaming an existing one.
 * Mirrors the visual language of `ConfirmModal` so the chat surface feels
 * consistent.
 */
export function ProjectModal({ open, mode, initialName = '', onClose, onSubmit }: ProjectModalProps) {
    const [name, setName] = useState(initialName);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync initial value whenever the modal opens / mode flips.
    useEffect(() => {
        if (open) {
            setName(mode === 'rename' ? initialName : '');
            // Defer focus so Radix-style mount animation completes first.
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [open, mode, initialName]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const trimmed = name.trim();
    const canSubmit =
        trimmed.length > 0 &&
        trimmed.length <= MAX_NAME &&
        !(mode === 'rename' && trimmed === initialName.trim()) &&
        !isSubmitting;

    const submit = async () => {
        if (!canSubmit) return;
        setIsSubmitting(true);
        try {
            await onSubmit(trimmed);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    const Icon = mode === 'create' ? FolderPlus : Pencil;
    const title = mode === 'create' ? 'New project' : 'Rename project';
    const submitLabel = mode === 'create' ? 'Create project' : 'Save';
    const placeholder = mode === 'create' ? 'e.g. Marketing site redesign' : 'Project name';

    return (
        <div
            className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-[420px] bg-popover text-popover-foreground rounded-2xl border border-border shadow-overlay overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="project-modal-title"
            >
                {/* Header */}
                <div className="flex items-start justify-between p-5 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4 text-foreground" />
                        </div>
                        <h2 id="project-modal-title" className="text-sm font-semibold text-foreground">
                            {title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-foreground-muted hover:text-foreground transition-colors p-1 rounded-md hover:bg-surface-2"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void submit();
                    }}
                >
                    <div className="px-5">
                        <label htmlFor="project-name" className="sr-only">
                            Project name
                        </label>
                        <input
                            ref={inputRef}
                            id="project-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={placeholder}
                            maxLength={MAX_NAME}
                            disabled={isSubmitting}
                            className={cn(
                                'w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-subtle',
                                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                                'transition-shadow'
                            )}
                        />
                        <div className="mt-1.5 text-[11px] text-foreground-subtle text-right tabular-nums">
                            {trimmed.length}/{MAX_NAME}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 px-5 pb-5 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-surface-2 hover:bg-surface-3 text-foreground-muted hover:text-foreground transition-colors border border-border disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={cn(
                                'flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors border',
                                canSubmit
                                    ? 'bg-foreground text-background hover:bg-foreground/90 border-transparent'
                                    : 'bg-surface-2 text-foreground-subtle border-border cursor-not-allowed'
                            )}
                        >
                            {isSubmitting ? 'Saving…' : submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
