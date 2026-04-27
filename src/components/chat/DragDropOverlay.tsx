'use client';

import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DragDropOverlayProps {
    visible: boolean;
}

/**
 * Visual hint that fades in when the user drags files over the chat input.
 * The actual drop handling lives on the wrapper element in ChatInput.
 */
export function DragDropOverlay({ visible }: DragDropOverlayProps) {
    return (
        <div
            aria-hidden={!visible}
            className={cn(
                'pointer-events-none absolute inset-0 z-20 flex items-center justify-center',
                'rounded-[28px] border-2 border-dashed border-primary/60',
                'bg-primary/5 backdrop-blur-[2px]',
                'transition-opacity duration-150',
                visible ? 'opacity-100' : 'opacity-0',
            )}
        >
            <div className="flex flex-col items-center gap-2 text-primary">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                    <Upload className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <p className="text-sm font-medium">Drop to attach</p>
                <p className="text-xs text-muted-foreground">Images, PDFs, code &amp; text files</p>
            </div>
        </div>
    );
}
