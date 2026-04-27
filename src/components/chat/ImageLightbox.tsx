'use client';

import * as React from 'react';
import { X, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageLightboxProps {
    src: string | null;
    alt?: string;
    onClose: () => void;
}

/**
 * Fullscreen lightbox used to peek at attached images (input previews and
 * persisted message attachments). Closes on backdrop click or ESC key.
 */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
    const open = !!src;

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        // Prevent body scroll while open
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open || !src) return null;

    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = src;
        a.download = alt || 'attachment';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={alt || 'Image preview'}
            onClick={onClose}
            className={cn(
                'fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10',
                'bg-background/85 backdrop-blur-md animate-in fade-in-0 duration-150',
            )}
        >
            {/* Top action bar */}
            <div
                className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10"
                onClick={(e) => e.stopPropagation()}
            >
                <p className="text-sm text-foreground/80 truncate max-w-[60vw]">{alt}</p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleDownload}
                        className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full',
                            'bg-card/80 text-foreground border border-border/60 backdrop-blur',
                            'hover:bg-card transition-colors',
                        )}
                        aria-label="Download"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full',
                            'bg-card/80 text-foreground border border-border/60 backdrop-blur',
                            'hover:bg-card transition-colors',
                        )}
                        aria-label="Close preview"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt || ''}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    'max-h-[88vh] max-w-[92vw] object-contain rounded-xl shadow-2xl',
                    'animate-in zoom-in-95 duration-200',
                )}
            />
        </div>
    );
}
