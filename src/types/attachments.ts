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
    /** Option A — small (~10–50 KB) data-URL preview used for UI tiles and history. */
    thumbnail?: string;
    /** Option B — plain text extracted from the document. */
    extractedText?: string;
}

/**
 * Slimmed-down version sent in the fetch body to /api/chat.
 * We strip fields that are only needed in the UI (name, sizeBytes).
 */
export type AttachmentPayload = Pick<Attachment, 'kind' | 'mimeType' | 'base64' | 'extractedText' | 'name'>;

/**
 * Persisted attachment metadata stored on chat_messages.attachments (JSONB).
 *
 * We never persist the full base64 — only the lightweight thumbnail (for images)
 * and the metadata needed to re-render a message bubble. Document text is also
 * dropped because it was already injected into the message content at send time.
 */
export interface MessageAttachment {
    kind: AttachmentKind;
    name: string;
    mimeType: string;
    sizeBytes: number;
    /** Image thumbnail data-URL — present for images only. */
    thumbnail?: string;
}
