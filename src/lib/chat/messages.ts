/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AttachmentPayload } from '@/types/attachments';
import { MAX_HISTORY_CHARS_PER_TURN } from '@/lib/limits';

/**
 * Helpers that turn raw inputs (DB rows, attachments, system prompts) into
 * the OpenAI/NVIDIA-compatible `messages` array the chat completion endpoint
 * expects. Pure functions — no DB access, no fetch.
 */

export interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

interface DbHistoryRow {
    role: string;
    content: string | null;
}

/**
 * Reverse a DESC-ordered chunk of `chat_messages` rows into chronological
 * order and trim each turn so a single huge paste doesn't blow out the
 * model's context window. The DB layer fetches with LIMIT, so we don't
 * worry about row count here.
 */
export function buildHistory(rows: DbHistoryRow[] | null | undefined): ChatTurn[] {
    if (!rows || rows.length === 0) return [];
    return [...rows]
        .reverse()
        .map((m) => {
            const raw = typeof m.content === 'string' ? m.content : '';
            const content =
                raw.length > MAX_HISTORY_CHARS_PER_TURN
                    ? raw.slice(0, MAX_HISTORY_CHARS_PER_TURN) + ' [truncated]'
                    : raw;
            return { role: m.role as 'user' | 'assistant', content };
        });
}

/**
 * Build the user message content. When images are present the model needs a
 * multimodal array (`{type: 'text', ...}` + `{type: 'image_url', ...}`),
 * otherwise a plain string is enough — sending an array unconditionally
 * triggers extra tokenisation overhead.
 *
 * Document attachments contribute their extracted text as a prelude.
 */
export function buildUserContent(
    content: string,
    attachments: AttachmentPayload[],
): string | any[] {
    const docContext = attachments
        .filter((a) => a.kind === 'document' && a.extractedText)
        .map((a) => `=== Attached document: ${a.name} ===\n${a.extractedText}\n===`)
        .join('\n\n');

    const userText = docContext ? `${docContext}\n\nUser message:\n${content}` : content;

    const images = attachments.filter((a) => a.kind === 'image' && a.base64);
    if (images.length === 0) return userText;

    return [
        { type: 'text', text: userText },
        ...images.map((a) => ({
            type: 'image_url',
            image_url: { url: a.base64 },
        })),
    ];
}

/**
 * Compose the final apiMessages payload. Keeping this in one place means the
 * route no longer mixes DB shape, attachment shape, and prompt shape.
 */
export function composeApiMessages(
    systemPrompt: string,
    history: ChatTurn[],
    userContent: string | any[],
): any[] {
    return [
        { role: 'system' as const, content: systemPrompt },
        ...history,
        { role: 'user' as const, content: userContent },
    ];
}
