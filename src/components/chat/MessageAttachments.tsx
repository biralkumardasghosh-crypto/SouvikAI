'use client';

import * as React from 'react';
import { FileText, FileCode2 } from 'lucide-react';
import { formatBytes } from '@/utils/attachments';
import type { MessageAttachment } from '@/types/attachments';
import { ImageLightbox } from './ImageLightbox';
import { cn } from '@/lib/utils';

interface MessageAttachmentsProps {
    attachments: MessageAttachment[];
}

/**
 * Renders persisted attachments inside a user message bubble.
 *
 * Image grid: up to four columns, full-bleed thumbnails with click-to-zoom.
 * Documents: compact card row with file icon, name and size.
 */
export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
    const [lightbox, setLightbox] = React.useState<{ src: string; alt: string } | null>(null);

    if (!attachments || attachments.length === 0) return null;

    const images = attachments.filter((a) => a.kind === 'image' && a.thumbnail);
    const docs = attachments.filter((a) => a.kind === 'document');

    return (
        <div className="flex flex-col items-end gap-1.5 w-full">
            {images.length > 0 && (
                <div
                    className={cn(
                        'grid gap-1.5 max-w-[88%] md:max-w-[75%]',
                        images.length === 1
                            ? 'grid-cols-1'
                            : images.length === 2
                            ? 'grid-cols-2'
                            : 'grid-cols-2 md:grid-cols-3',
                    )}
                >
                    {images.map((a, i) => (
                        <button
                            key={`${a.name}-${i}`}
                            type="button"
                            onClick={() => setLightbox({ src: a.thumbnail!, alt: a.name })}
                            className={cn(
                                'group relative overflow-hidden rounded-xl border border-border/50',
                                'bg-muted shadow-sm cursor-zoom-in',
                                images.length === 1 ? 'h-44 w-44 md:h-56 md:w-56' : 'h-28 w-28 md:h-32 md:w-32',
                            )}
                            title={a.name}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={a.thumbnail}
                                alt={a.name}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                        </button>
                    ))}
                </div>
            )}

            {docs.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1.5 max-w-[88%] md:max-w-[75%]">
                    {docs.map((a, i) => {
                        const ext = a.name.split('.').pop()?.toUpperCase() ?? 'DOC';
                        const isCode = /^(JS|TS|TSX|JSX|PY|JAVA|GO|RS|CPP|C|HTML|CSS|XML|YAML|YML|JSON|MD)$/i.test(ext);
                        const Icon = isCode ? FileCode2 : FileText;
                        return (
                            <div
                                key={`${a.name}-${i}`}
                                className={cn(
                                    'flex items-center gap-2.5 rounded-xl border border-border/50',
                                    'bg-card pl-2 pr-3 py-1.5 shadow-sm max-w-[260px]',
                                )}
                                title={a.name}
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon className="h-4 w-4" strokeWidth={2} />
                                </span>
                                <div className="flex min-w-0 flex-col leading-tight">
                                    <p className="truncate text-[12px] font-medium text-foreground">{a.name}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono uppercase tracking-wide">
                                        {ext} · {formatBytes(a.sizeBytes)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ImageLightbox
                src={lightbox?.src ?? null}
                alt={lightbox?.alt}
                onClose={() => setLightbox(null)}
            />
        </div>
    );
}
