import type { BuilderStep } from '@/types/code';
import { MAX_HISTORY_CHARS_PER_TURN } from '@/lib/limits';

/**
 * Compress an old turn into a single string the model can use as context.
 *
 * - User turns: pass through with a hard char cap.
 * - Assistant turns: summarise the timeline (milestones + applied file
 *   actions + reads) instead of replaying every streamed token. This keeps
 *   the prompt size bounded even after dozens of turns.
 */
export function renderHistoryContent(
    role: 'user' | 'assistant',
    content: string,
    steps: BuilderStep[],
): string {
    if (role === 'user') {
        return content.length > MAX_HISTORY_CHARS_PER_TURN
            ? content.slice(0, MAX_HISTORY_CHARS_PER_TURN) + ' [truncated]'
            : content;
    }

    const parts: string[] = [];
    for (const s of steps) {
        if (s.kind === 'milestone') {
            parts.push(`• ${s.text}`);
        } else if (s.kind === 'read') {
            parts.push(`[read] ${s.path}`);
        } else if (s.action.kind === 'rename') {
            parts.push(`[rename] ${s.action.from} → ${s.action.to}`);
        } else {
            parts.push(`[${s.action.kind}] ${s.action.path}`);
        }
    }
    if (content.trim()) parts.push(content.trim());

    const joined = parts.join('\n');
    return joined.length > MAX_HISTORY_CHARS_PER_TURN
        ? joined.slice(0, MAX_HISTORY_CHARS_PER_TURN) + ' [truncated]'
        : joined;
}
