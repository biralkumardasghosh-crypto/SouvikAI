import type {
    BuilderFiles,
    BuilderFileAction,
    PendingChange,
} from '@/types/code';

/**
 * Pure helpers for the in-memory file map kept by `useBuilderAgent`.
 *
 * Extracted so:
 *   - Reasoning about state transitions doesn't require reading the whole hook.
 *   - The same logic can be unit-tested without React.
 *   - Adding a new action kind only touches this file (plus the agent tools).
 */

export function applyAction(files: BuilderFiles, action: BuilderFileAction): BuilderFiles {
    if (action.kind === 'delete') {
        if (!(action.path in files)) return files;
        const next = { ...files };
        delete next[action.path];
        return next;
    }
    if (action.kind === 'rename') {
        if (action.from === action.to) return files;
        if (!(action.from in files)) {
            // Source missing — nothing to move. The server will no-op too.
            return files;
        }
        const next = { ...files };
        next[action.to] = next[action.from];
        delete next[action.from];
        return next;
    }
    return { ...files, [action.path]: action.content };
}

/**
 * Decide which file should remain active after a server action lands. Tries
 * to keep the user focused on the same logical file (rename → follow), or
 * falls back to the first remaining file when the active one was deleted.
 */
export function nextActiveFile(
    currentActive: string | null,
    nextFiles: BuilderFiles,
    action: BuilderFileAction,
): string | null {
    if (action.kind === 'delete' && currentActive === action.path) {
        const keys = Object.keys(nextFiles);
        return keys[0] ?? null;
    }
    if (action.kind === 'rename' && currentActive === action.from) {
        // Follow the move so the editor stays focused on the same file.
        return action.to;
    }
    if ((action.kind === 'create' || action.kind === 'edit') && !currentActive) {
        return action.path;
    }
    return currentActive;
}

export function genId(prefix = 'm'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Six-word summary used as the workspace title for a brand-new build. */
export function deriveWorkspaceTitle(message: string): string {
    const words = message.split(/\s+/).slice(0, 6).join(' ');
    return words.length > 50 ? words.slice(0, 50) + '…' : words || 'New build';
}

/**
 * Distil a turn's stream of {@link BuilderFileAction}s into a per-path
 * {@link PendingChange} list, computed against the snapshot taken when
 * the turn started.
 *
 * Multiple actions targeting the same path within a single turn are
 * collapsed into one net change: e.g. `create foo.ts` + `edit foo.ts`
 * shows up as a single "Created `foo.ts`" entry with the final content
 * as `after`. Renames produce two linked entries — a delete at the
 * original path and a create at the new path — so each side gets its
 * own diff and can be accepted/rejected independently.
 *
 * Paths whose final content equals the snapshot are filtered out (e.g.
 * the agent edited a file and then reverted to the original); they
 * don't represent a user-visible change worth reviewing.
 */
export function buildPendingChanges(
    snapshot: BuilderFiles,
    actions: BuilderFileAction[],
): PendingChange[] {
    // Walk actions in order against a working copy and remember the
    // most-recent rename pairing for each affected path.
    const working: BuilderFiles = { ...snapshot };
    // Map "from" -> "to" tracking the latest move for any path. Used
    // only for UI labels; multi-step renames (a → b → c) collapse
    // to (a → c).
    const movedTo = new Map<string, string>();
    const movedFrom = new Map<string, string>();

    for (const action of actions) {
        if (action.kind === 'create' || action.kind === 'edit') {
            working[action.path] = action.content;
            continue;
        }
        if (action.kind === 'delete') {
            delete working[action.path];
            continue;
        }
        // rename
        if (action.from === action.to) continue;
        if (action.from in working) {
            working[action.to] = working[action.from];
            delete working[action.from];
        }
        // Walk back through any earlier rename so we point at the
        // original path the user knew, not an intermediate alias.
        const ultimateFrom = movedFrom.get(action.from) ?? action.from;
        // Clear the previous edge if we're moving again so we don't
        // accumulate stale links.
        const prevTo = movedTo.get(ultimateFrom);
        if (prevTo && prevTo !== action.to) movedFrom.delete(prevTo);
        movedTo.set(ultimateFrom, action.to);
        movedFrom.set(action.to, ultimateFrom);
    }

    // Compute the union of all paths that appeared on either side.
    // Build via an object to avoid Set-iteration target requirements.
    const pathSet: Record<string, true> = {};
    for (const k of Object.keys(snapshot)) pathSet[k] = true;
    for (const k of Object.keys(working)) pathSet[k] = true;

    const out: PendingChange[] = [];
    for (const path of Object.keys(pathSet)) {
        const before = path in snapshot ? snapshot[path] : null;
        const after = path in working ? working[path] : null;
        if (before === after) continue; // No net change.

        let kind: PendingChange['kind'];
        if (before === null && after !== null) kind = 'create';
        else if (before !== null && after === null) kind = 'delete';
        else kind = 'edit';

        const change: PendingChange = { path, kind, before, after };
        if (kind === 'delete' && movedTo.has(path)) {
            change.renamedTo = movedTo.get(path);
        }
        if (kind === 'create' && movedFrom.has(path)) {
            change.renamedFrom = movedFrom.get(path);
        }
        out.push(change);
    }

    // Sort: creates first, then edits, then deletes; alphabetical
    // within each bucket for stable display.
    const order: Record<PendingChange['kind'], number> = {
        create: 0,
        edit: 1,
        delete: 2,
    };
    out.sort((a, b) => {
        const k = order[a.kind] - order[b.kind];
        return k !== 0 ? k : a.path.localeCompare(b.path);
    });
    return out;
}
