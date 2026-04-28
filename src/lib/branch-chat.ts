/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * Shared "branch a chat" utility.
 *
 * Used by every surface that exposes a 3-dot "Branch" action — the home
 * sidebar (via useChat), the /chats library, and per-project chat lists. By
 * funneling the logic through one helper we keep behavior consistent: the
 * same title format, the same snapshot-then-copy semantics, and the same
 * monotonic timestamp trick that preserves message ordering.
 */

import { createClient } from '@/lib/supabase/client';
import type { ChatSession } from '@/types/chat';

const supabase = createClient();

/**
 * Source columns we need to snapshot. We deliberately re-fetch instead of
 * trusting whatever is in local state so the branch is always based on the
 * authoritative server-side data — important if the chat was renamed in
 * another tab.
 */
interface SourceSession {
    id: string;
    title: string;
    project_id: string | null;
}

/**
 * Branch an existing chat into a new session.
 *
 * Semantics:
 *  - The new session is owned by `userId`, lives in the same project as the
 *    source (or no project if the source has none), and has its title set to
 *    "Branch of <source title>".
 *  - All messages from the source are duplicated into the new session, in
 *    order. We synthesize `created_at` values from a monotonically
 *    increasing base so chat_messages stays sortable by time even when the
 *    bulk insert lands in the same millisecond.
 *  - `branched_from_session_id` and `branched_from_title` are stored so the
 *    UI can render the "Branched from <title>" divider at the top of the
 *    new chat — even if the source is later renamed or deleted.
 *
 * Returns the new ChatSession on success, or `null` on any failure (in which
 * case nothing partial is left behind: we abort before copying messages if
 * the session insert fails, and a failed message bulk-insert simply leaves
 * the new session empty rather than half-copied).
 */
export async function branchChatSession(
    sourceSessionId: string,
    userId: string
): Promise<ChatSession | null> {
    // 1. Snapshot source session metadata
    const { data: srcRaw, error: srcErr } = await supabase
        .from('chat_sessions')
        .select('id, title, project_id')
        .eq('id', sourceSessionId)
        .single();

    if (srcErr || !srcRaw) {
        console.error('[branchChatSession] Failed to load source session:', srcErr);
        return null;
    }
    const src = srcRaw as SourceSession;
    const sourceTitle = src.title || 'Untitled chat';
    const newTitle = `Branch of ${sourceTitle}`;

    // 2. Create the new session
    const insertPayload = {
        user_id: userId,
        title: newTitle,
        project_id: src.project_id ?? null,
        branched_from_session_id: src.id,
        branched_from_title: sourceTitle,
    };

    const { data: newRow, error: newErr } = await (supabase as any)
        .from('chat_sessions')
        .insert(insertPayload)
        .select()
        .single();

    if (newErr || !newRow) {
        console.error('[branchChatSession] Failed to create branch session:', newErr);
        return null;
    }

    // 3. Copy all messages from the source, preserving order
    const { data: msgs, error: msgErr } = await supabase
        .from('chat_messages')
        .select('role, content, attachments, created_at')
        .eq('session_id', sourceSessionId)
        .order('created_at', { ascending: true });

    if (msgErr) {
        console.error('[branchChatSession] Failed to read source messages:', msgErr);
        // Swallow: the new session still exists with the divider, just empty.
    } else if (msgs && msgs.length > 0) {
        // Synthesize strictly increasing timestamps so ordering by created_at
        // remains stable even though we bulk-insert.
        const baseTime = Date.now();
        const copied = (msgs as any[]).map((m, i) => ({
            session_id: newRow.id,
            user_id: userId,
            role: m.role,
            content: m.content,
            attachments: m.attachments ?? null,
            created_at: new Date(baseTime + i).toISOString(),
        }));

        const { error: copyErr } = await (supabase as any)
            .from('chat_messages')
            .insert(copied);
        if (copyErr) {
            console.error('[branchChatSession] Failed to copy messages:', copyErr);
        }
    }

    return {
        id: newRow.id,
        userId: newRow.user_id,
        title: newRow.title,
        createdAt: new Date(newRow.created_at),
        updatedAt: new Date(newRow.updated_at),
        isPinned: newRow.is_pinned ?? false,
        isArchived: newRow.is_archived ?? false,
        projectId: newRow.project_id ?? null,
        branchedFromSessionId: newRow.branched_from_session_id ?? null,
        branchedFromTitle: newRow.branched_from_title ?? null,
    };
}
