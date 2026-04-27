'use client';

import * as React from 'react';
import { FileText, FileCode2, FileImage, X, Eye } from 'lucide-react';
import { formatBytes } from '@/utils/attachments';
import type { Attachment } from '@/types/attachments';
import { cn } from '@/lib/utils';

interface AttachmentPreviewProps {
    attachment: Attachment;
    onRemove?: (id: string) => void;
    onPreview?: (attachment: Attachment) => void;
    /** Read-only mode used inside message bubbles (no remove button). */
    readonly?: boolean;
}

/**
 * Rich attachment tile shown above the chat input and inside user message
 * bubbles. Replaces the older AttachmentChip — uses real image thumbnails for
 * images and a colour-coded card for documents.
 */
export function AttachmentPreview({ attachment, onRemove, onPreview, readonly }: AttachmentPreviewProps) {
    const isImage = attachment.kind === 'image';
    const previewSrc = attachment.thumbnail || attachment.base64;

    if (isImage) {
        return (
            <div
                className={cn(
                    'group/att relative overflow-hidden rounded-xl border border-border/60',
                    'h-20 w-20 shrink-0 bg-muted shadow-sm',
                    onPreview && 'cursor-zoom-in',
                )}
                onClick={() => onPreview?.(attachment)}
                title={attachment.name}
            >
                {previewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={previewSrc}
                        alt={attachment.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover/att:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <FileImage className="h-6 w-6 text-muted-foreground" />
                    </div>
                )}

                {/* Hover veil with peek hint */}
                {onPreview && (
                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity duration-150 group-hover/att:opacity-100">
                        <Eye className="h-5 w-5 text-background" strokeWidth={2.25} />
                    </div>
                )}

                {/* Remove button */}
                {!readonly && onRemove && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(attachment.id);
                        }}
                        aria-label={`Remove ${attachment.name}`}
                        className={cn(
                            'absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full',
                            'bg-foreground/85 text-background shadow-md',
                            'opacity-0 group-hover/att:opacity-100 transition-opacity duration-150',
                            'hover:bg-foreground',
                        )}
                    >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                )}
            </div>
        );
    }

    // Document tile
    const ext = attachment.name.split('.').pop()?.toUpperCase() ?? 'DOC';
    const isCode = /^(JS|TS|TSX|JSX|PY|JAVA|GO|RS|CPP|C|HTML|CSS|XML|YAML|YML|JSON|MD)$/i.test(ext);
    const Icon = isCode ? FileCode2 : FileText;

    return (
        <div
            className={cn(
                'group/att relative flex items-center gap-3 rounded-xl border border-border/60',
                'bg-card pl-2.5 pr-3 py-2 shadow-sm h-20 w-[220px] shrink-0',
            )}
            title={attachment.name}
        >
            <span
                className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
                    'bg-primary/10 text-primary',
                )}
            >
                <Icon className="h-5 w-5" strokeWidth={2} />
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-[13px] font-medium text-foreground leading-tight">
                    {attachment.name}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                    <span className="font-mono uppercase tracking-wide">{ext}</span>
                    <span className="mx-1.5 opacity-50">·</span>
                    {formatBytes(attachment.sizeBytes)}
                </p>
            </div>

            {!readonly && onRemove && (
                <button
                    type="button"
                    onClick={() => onRemove(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                    className={cn(
                        'absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full',
                        'bg-foreground/90 text-background shadow-md',
                        'opacity-0 group-hover/att:opacity-100 transition-opacity duration-150',
                        'hover:bg-foreground',
                    )}
                >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
            )}
        </div>
    );
}
