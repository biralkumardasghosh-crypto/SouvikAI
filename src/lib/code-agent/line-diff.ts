/**
 * Tiny line-level diff used by the Builder's review panel.
 *
 * We deliberately avoid pulling in a third-party diff library — Builder
 * files are typically small and the review UI only needs a coarse
 * line-by-line comparison. The algorithm is the standard
 * Longest-Common-Subsequence dynamic programme, which runs in
 * O(m × n) time and memory where m / n are the line counts of the two
 * sides.
 *
 * The output is a row-aligned representation suited to a side-by-side
 * view: each {@link DiffRow} corresponds to one screen row, with either
 * a left line, a right line, or both. This keeps the rendering layer
 * straightforward — render rows in order, colour them by `kind`.
 */

export type DiffRowKind =
    /** Same line on both sides — render unchanged. */
    | 'context'
    /** Line removed: left side only, right side empty. */
    | 'remove'
    /** Line added: right side only, left side empty. */
    | 'add'
    /** Replaced: both sides have a line, but they differ. */
    | 'change';

export interface DiffRow {
    kind: DiffRowKind;
    /** 1-based line number on the left (before) side, or null. */
    leftNumber: number | null;
    /** 1-based line number on the right (after) side, or null. */
    rightNumber: number | null;
    /** Original text on the left, or null when `kind === 'add'`. */
    left: string | null;
    /** Original text on the right, or null when `kind === 'remove'`. */
    right: string | null;
}

export interface DiffSummary {
    rows: DiffRow[];
    additions: number;
    removals: number;
}

/**
 * Compute a side-by-side line diff between two strings. Either side
 * may be `null` to represent a non-existent file (used for create /
 * delete diffs).
 */
export function computeLineDiff(before: string | null, after: string | null): DiffSummary {
    const leftLines = before === null ? [] : splitLines(before);
    const rightLines = after === null ? [] : splitLines(after);

    // ── Build LCS DP table ────────────────────────────────────────────
    const m = leftLines.length;
    const n = rightLines.length;
    // Single flat Int32Array is much friendlier to V8 than a nested array.
    const dp = new Int32Array((m + 1) * (n + 1));
    const stride = n + 1;
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (leftLines[i] === rightLines[j]) {
                dp[i * stride + j] = dp[(i + 1) * stride + (j + 1)] + 1;
            } else {
                const a = dp[(i + 1) * stride + j];
                const b = dp[i * stride + (j + 1)];
                dp[i * stride + j] = a > b ? a : b;
            }
        }
    }

    // ── Backtrack into a sequence of {context | add | remove} ops ────
    type Op =
        | { kind: 'context'; left: string; right: string }
        | { kind: 'remove'; left: string }
        | { kind: 'add'; right: string };
    const ops: Op[] = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (leftLines[i] === rightLines[j]) {
            ops.push({ kind: 'context', left: leftLines[i], right: rightLines[j] });
            i++;
            j++;
        } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
            ops.push({ kind: 'remove', left: leftLines[i] });
            i++;
        } else {
            ops.push({ kind: 'add', right: rightLines[j] });
            j++;
        }
    }
    while (i < m) {
        ops.push({ kind: 'remove', left: leftLines[i] });
        i++;
    }
    while (j < n) {
        ops.push({ kind: 'add', right: rightLines[j] });
        j++;
    }

    // ── Coalesce adjacent {remove, add} pairs into 'change' rows ─────
    // so a modified line shows aligned old / new text on the same row,
    // which reads more naturally than two separate rows.
    const rows: DiffRow[] = [];
    let leftCursor = 1;
    let rightCursor = 1;
    let additions = 0;
    let removals = 0;

    for (let k = 0; k < ops.length; k++) {
        const op = ops[k];
        if (op.kind === 'context') {
            rows.push({
                kind: 'context',
                leftNumber: leftCursor,
                rightNumber: rightCursor,
                left: op.left,
                right: op.right,
            });
            leftCursor++;
            rightCursor++;
            continue;
        }

        // Group runs of consecutive remove/add ops so we can pair them
        // up in order and render leftover ones as add-only / remove-only.
        const removes: string[] = [];
        const adds: string[] = [];
        while (k < ops.length && (ops[k].kind === 'remove' || ops[k].kind === 'add')) {
            const cur = ops[k];
            if (cur.kind === 'remove') removes.push(cur.left);
            else adds.push(cur.right);
            k++;
        }
        k--; // Step back so the outer loop's k++ lands on the next op.

        const pairs = Math.min(removes.length, adds.length);
        for (let p = 0; p < pairs; p++) {
            rows.push({
                kind: 'change',
                leftNumber: leftCursor,
                rightNumber: rightCursor,
                left: removes[p],
                right: adds[p],
            });
            leftCursor++;
            rightCursor++;
            additions++;
            removals++;
        }
        for (let p = pairs; p < removes.length; p++) {
            rows.push({
                kind: 'remove',
                leftNumber: leftCursor,
                rightNumber: null,
                left: removes[p],
                right: null,
            });
            leftCursor++;
            removals++;
        }
        for (let p = pairs; p < adds.length; p++) {
            rows.push({
                kind: 'add',
                leftNumber: null,
                rightNumber: rightCursor,
                left: null,
                right: adds[p],
            });
            rightCursor++;
            additions++;
        }
    }

    return { rows, additions, removals };
}

/**
 * Mirror Node's behaviour where a trailing newline does NOT produce
 * an extra empty line, but standalone empty lines between content
 * are preserved. Splits on \n / \r\n / \r.
 */
function splitLines(text: string): string[] {
    if (text === '') return [];
    const normalised = text.replace(/\r\n?/g, '\n');
    const lines = normalised.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}
