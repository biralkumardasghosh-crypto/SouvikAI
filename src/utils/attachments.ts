/**
 * Client-side attachment processing utilities.
 *
 * Option A — images  → base64 data-URL, sent inline to NVIDIA NIM vision API.
 * Option B — docs    → text extracted via PDF.js (PDFs) or FileReader (text files).
 *
 * Nothing is ever uploaded to Supabase Storage.
 */

import type { Attachment } from '@/types/attachments';

/** File types we accept for Option A (images). */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

/** File types we accept for Option B (documents). */
export const DOCUMENT_ACCEPT = '.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.java,.go,.rs,.cpp,.c,.html,.css,.xml,.yaml,.yml';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB
const MAX_DOC_BYTES   = 2 * 1024 * 1024;   // 2 MB extracted text cap

/**
 * Reads an image File and returns a base64 data-URL string.
 */
function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.readAsDataURL(file);
    });
}

/**
 * Reads a plain-text file and returns its content as a string.
 */
function readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.readAsText(file);
    });
}

/**
 * Extracts all text from a PDF using PDF.js (loaded dynamically so it doesn't
 * bloat the initial bundle).
 */
async function extractPdfText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();

    // Dynamic import keeps pdfjs-dist out of the main bundle.
    const pdfjsLib = await import('pdfjs-dist');

    // Point the worker at the bundled worker file served from Next.js public dir.
    // We use a CDN URL so we don't have to manually copy the worker file.
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text    = content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');
        pageTexts.push(text);
    }

    return pageTexts.join('\n\n');
}

/**
 * Processes a single File into an Attachment object.
 * Throws a user-friendly Error if the file is unsupported or too large.
 */
export async function processFile(file: File): Promise<Attachment> {
    const id = crypto.randomUUID();

    // ── Images (Option A) ──────────────────────────────────────────────────────
    if (file.type.startsWith('image/')) {
        if (file.size > MAX_IMAGE_BYTES) {
            throw new Error(`"${file.name}" is too large. Images must be under 5 MB.`);
        }
        const base64 = await readAsBase64(file);
        return { id, name: file.name, kind: 'image', mimeType: file.type, sizeBytes: file.size, base64 };
    }

    // ── PDFs (Option B via PDF.js) ─────────────────────────────────────────────
    if (file.type === 'application/pdf') {
        if (file.size > 20 * 1024 * 1024) {
            throw new Error(`"${file.name}" is too large. PDFs must be under 20 MB.`);
        }
        const extractedText = await extractPdfText(file);
        if (extractedText.length > MAX_DOC_BYTES) {
            throw new Error(`"${file.name}" has too much text (${Math.round(extractedText.length / 1024)} KB). Please use a smaller excerpt.`);
        }
        return { id, name: file.name, kind: 'document', mimeType: file.type, sizeBytes: file.size, extractedText };
    }

    // ── Plain text / code / CSV / JSON (Option B via FileReader) ──────────────
    const extractedText = await readAsText(file);
    if (extractedText.length > MAX_DOC_BYTES) {
        throw new Error(`"${file.name}" is too large. Document text must be under 2 MB after extraction.`);
    }
    return { id, name: file.name, kind: 'document', mimeType: file.type, sizeBytes: file.size, extractedText };
}

/**
 * Formats a byte count into a human-readable string (KB / MB).
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024)          return `${bytes} B`;
    if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
