/**
 * Attachment types shared between the UI layer and the chat API route.
 *
 * Option A — images: converted to base64 in the browser and sent inline
 *   to NVIDIA NIM using the OpenAI vision content-array format.
 * Option B — documents: text extracted client-side and prepended to the
 *   user message, so the LLM has context without storing the raw file.
 */

export type AttachmentKind = 'image' | 'document';

export interface Attachment {
    /** Stable client-side identifier. */
    id: string;
    /** Original filename shown in the chip. */
    name: string;
    kind: AttachmentKind;
    mimeType: string;
    sizeBytes: number;
    /** Option A — full base64 data-URL, e.g. "data:image/png;base64,..." */
    base64?: string;
    /** Option B — plain text extracted from the document. */
    extractedText?: string;
}

/**
 * Slimmed-down version sent in the fetch body to /api/chat.
 * We strip fields that are only needed in the UI (name, sizeBytes).
 */
export type AttachmentPayload = Pick<Attachment, 'kind' | 'mimeType' | 'base64' | 'extractedText' | 'name'>;
