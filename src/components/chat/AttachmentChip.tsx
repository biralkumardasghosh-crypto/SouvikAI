'use client';

import { FileImage, FileText, X } from 'lucide-react';
import { formatBytes } from '@/utils/attachments';
import type { Attachment } from '@/types/attachments';
import { cn } from '@/lib/utils';

interface AttachmentChipProps {
    attachment: Attachment;
    onRemove: (id: string) => void;
}

/**
 * A compact chip that represents a pending attachment below the chat input.
 * Shows a thumbnail for images and a file icon for documents.
 */
export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
    const isImage = attachment.kind === 'image';

    return (
        <div
            className={cn(
                'group relative flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-xl border border-white/10',
                'bg-white/5 hover:bg-white/10 transition-colors max-w-[180px]',
            )}
        >
            {/* Thumbnail or icon */}
            {isImage && attachment.base64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={attachment.base64}
                    alt={attachment.name}
                    className="h-8 w-8 rounded-lg object-cover shrink-0 border border-white/10"
                />
            ) : (
                <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/10 shrink-0">
                    {isImage
                        ? <FileImage className="h-4 w-4 text-muted-foreground" />
                        : <FileText className="h-4 w-4 text-muted-foreground" />
                    }
                </span>
            )}

            {/* Name + size */}
            <div className="flex flex-col min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground truncate leading-none">{attachment.name}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-none">{formatBytes(attachment.sizeBytes)}</p>
            </div>

            {/* Remove button */}
            <button
                onClick={() => onRemove(attachment.id)}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-white/15 transition-colors"
                title={`Remove ${attachment.name}`}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}
