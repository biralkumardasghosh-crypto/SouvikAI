'use client';

import { useState, useCallback } from 'react';
import { processFile } from '@/utils/attachments';
import type { Attachment } from '@/types/attachments';

interface UseAttachmentsReturn {
    attachments: Attachment[];
    isProcessing: boolean;
    processingError: string | null;
    addFiles: (files: FileList | File[]) => Promise<void>;
    removeAttachment: (id: string) => void;
    clearAttachments: () => void;
}

/**
 * Manages the list of pending attachments for a single message.
 * Call clearAttachments() after sendMessage() succeeds.
 */
export function useAttachments(): UseAttachmentsReturn {
    const [attachments, setAttachments]     = useState<Attachment[]>([]);
    const [isProcessing, setIsProcessing]   = useState(false);
    const [processingError, setProcessingError] = useState<string | null>(null);

    const addFiles = useCallback(async (files: FileList | File[]) => {
        setIsProcessing(true);
        setProcessingError(null);

        const fileArray = Array.from(files);
        const results: Attachment[] = [];

        for (const file of fileArray) {
            try {
                const attachment = await processFile(file);
                results.push(attachment);
            } catch (err) {
                setProcessingError((err as Error).message);
                // Stop processing remaining files on first error
                break;
            }
        }

        if (results.length > 0) {
            setAttachments((prev) => [...prev, ...results]);
        }

        setIsProcessing(false);
    }, []);

    const removeAttachment = useCallback((id: string) => {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
    }, []);

    const clearAttachments = useCallback(() => {
        setAttachments([]);
        setProcessingError(null);
    }, []);

    return { attachments, isProcessing, processingError, addFiles, removeAttachment, clearAttachments };
}
