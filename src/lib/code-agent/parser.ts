import type { BuilderFileAction, BuilderStreamEvent } from '@/types/code';

/**
 * Streaming parser that converts a raw model output stream into a sequence of
 * {@link BuilderStreamEvent}s.
 *
 * Recognised tags (case-insensitive on the tag name):
 *   • <milestone>...</milestone>
 *   • <action type="create" path="...">...</action>
 *   • <action type="edit"   path="...">...</action>
 *   • <action type="delete" path="..." />
 *   • <action type="rename" from="..." to="..." />
 *   • <read path="..." />            — agent tool call: fetch full file contents
 *
 * Anything outside a tag is emitted as `{ type: 'text', delta: ... }`. A `<`
 * that *might* be the start of a tag is held back until we have enough buffer
 * to decide.
 */
export class BuilderTagStreamParser {
    private buffer = '';

    /** Feed a chunk of raw model text and receive any complete events extracted. */
    feed(chunk: string): BuilderStreamEvent[] {
        this.buffer += chunk;
        return this.drain(false);
    }

    /** Flush any remaining buffered text. Call once when the upstream closes. */
    flush(): BuilderStreamEvent[] {
        return this.drain(true);
    }

    // ── internals ───────────────────────────────────────────────────────────

    private drain(final: boolean): BuilderStreamEvent[] {
        const events: BuilderStreamEvent[] = [];

        while (true) {
            const tagStart = this.findNextTagStart();

            // No recognized tag start in the buffer.
            if (tagStart === -1) {
                // Hold back from the last `<` in case it's a partial tag,
                // unless we're flushing — then emit everything as text.
                const lastLT = this.buffer.lastIndexOf('<');
                if (final || lastLT === -1) {
                    if (this.buffer) events.push({ type: 'text', delta: this.buffer });
                    this.buffer = '';
                } else {
                    if (lastLT > 0) {
                        events.push({ type: 'text', delta: this.buffer.slice(0, lastLT) });
                    }
                    this.buffer = this.buffer.slice(lastLT);
                }
                break;
            }

            const parsed = this.tryParseTagAt(tagStart, final);
            if (!parsed) {
                // Tag is starting but not yet complete. Emit any preceding
                // text, hold the partial tag, and wait for more input.
                if (tagStart > 0) {
                    events.push({ type: 'text', delta: this.buffer.slice(0, tagStart) });
                    this.buffer = this.buffer.slice(tagStart);
                }
                break;
            }

            // Emit prefix text, then the tag event, then advance past it.
            if (tagStart > 0) {
                events.push({ type: 'text', delta: this.buffer.slice(0, tagStart) });
            }
            if (parsed.event) events.push(parsed.event);
            this.buffer = this.buffer.slice(parsed.consumed);
        }

        return events;
    }

    /**
     * Returns the smallest index in the buffer where a recognised tag begins,
     * or -1 if there's no candidate. We require the tag name be followed by
     * `>`, `/`, or whitespace so we don't false-match identifiers like
     * `<milestoneList>` or `<actionable>`.
     */
    private findNextTagStart(): number {
        let earliest = -1;
        const candidates = [
            /<milestone[\s>/]/gi,
            /<\/milestone>/gi,
            /<action[\s>/]/gi,
            /<read[\s>/]/gi,
        ];
        for (const re of candidates) {
            re.lastIndex = 0;
            const m = re.exec(this.buffer);
            if (m && (earliest === -1 || m.index < earliest)) {
                earliest = m.index;
            }
        }
        return earliest;
    }

    /**
     * Attempts to parse a complete tag starting at `idx`. Returns:
     *   • `{ event, consumed }` when a full tag is present.
     *   • `null`  when the tag has begun but is not yet complete (need more input).
     *
     * On a flush (`final = true`), returns `null` only if there's truly no way
     * to complete the tag from what's left in the buffer.
     */
    private tryParseTagAt(idx: number, final: boolean): { event: BuilderStreamEvent | null; consumed: number } | null {
        const rest = this.buffer.slice(idx);

        // ── milestone ────────────────────────────────────────────────────────
        const milestoneMatch = /^<milestone\s*>([\s\S]*?)<\/milestone>/i.exec(rest);
        if (milestoneMatch) {
            return {
                event: { type: 'milestone', text: milestoneMatch[1].trim() },
                consumed: idx + milestoneMatch[0].length,
            };
        }
        if (/^<milestone[\s>]/i.test(rest)) {
            // Open tag detected, no close yet. If flushing, drop it.
            if (final) {
                return { event: null, consumed: idx + rest.length };
            }
            return null;
        }
        // Stray closing tag — drop it.
        if (/^<\/milestone>/i.test(rest)) {
            return { event: null, consumed: idx + '</milestone>'.length };
        }

        // ── action: self-closing (delete only) ───────────────────────────────
        const selfClose = /^<action([^>]*?)\/\s*>/i.exec(rest);
        if (selfClose) {
            const attrs = parseAttrs(selfClose[1]);
            const action = buildActionFromAttrs(attrs, '');
            return {
                event: action ? { type: 'action', action } : null,
                consumed: idx + selfClose[0].length,
            };
        }

        // ── action: open + close ─────────────────────────────────────────────
        const fullAction = /^<action([^>]*)>([\s\S]*?)<\/action>/i.exec(rest);
        if (fullAction) {
            const attrs = parseAttrs(fullAction[1]);
            const body = stripCDATA(fullAction[2]).replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '');
            const action = buildActionFromAttrs(attrs, body);
            return {
                event: action ? { type: 'action', action } : null,
                consumed: idx + fullAction[0].length,
            };
        }
        if (/^<action[\s>]/i.test(rest)) {
            if (final) {
                return { event: null, consumed: idx + rest.length };
            }
            return null;
        }

        // ── read: self-closing tool call ─────────────────────────────────────
        // Form: <read path="..." />  (the open+close form is also accepted in
        // case the model emits it, but the body is ignored — it's a tool call,
        // not a content tag.)
        const readSelfClose = /^<read([^>]*?)\/\s*>/i.exec(rest);
        if (readSelfClose) {
            const attrs = parseAttrs(readSelfClose[1]);
            const path = sanitizePath(attrs.path || '');
            return {
                event: path ? { type: 'read', path } : null,
                consumed: idx + readSelfClose[0].length,
            };
        }
        const readFullClose = /^<read([^>]*)>([\s\S]*?)<\/read>/i.exec(rest);
        if (readFullClose) {
            const attrs = parseAttrs(readFullClose[1]);
            const path = sanitizePath(attrs.path || '');
            return {
                event: path ? { type: 'read', path } : null,
                consumed: idx + readFullClose[0].length,
            };
        }
        if (/^<read[\s>]/i.test(rest)) {
            if (final) {
                return { event: null, consumed: idx + rest.length };
            }
            return null;
        }

        // No recognised pattern at idx — emit the `<` as text and advance one char.
        return { event: { type: 'text', delta: '<' }, consumed: idx + 1 };
    }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function parseAttrs(s: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /(\w+)\s*=\s*"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
        attrs[m[1].toLowerCase()] = m[2];
    }
    return attrs;
}

function stripCDATA(s: string): string {
    const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i.exec(s);
    return m ? m[1] : s;
}

/**
 * Validate parsed attributes and build a {@link BuilderFileAction}.
 * Returns null when the action is malformed (e.g. missing path).
 */
function buildActionFromAttrs(
    attrs: Record<string, string>,
    body: string,
): BuilderFileAction | null {
    const type = (attrs.type || '').toLowerCase();

    // Rename uses `from` + `to` instead of `path` and never carries a body.
    if (type === 'rename') {
        const from = sanitizePath(attrs.from || '');
        const to = sanitizePath(attrs.to || '');
        if (!from || !to || from === to) return null;
        return { kind: 'rename', from, to };
    }

    const path = sanitizePath(attrs.path || '');
    if (!path) return null;

    if (type === 'create') return { kind: 'create', path, content: body };
    if (type === 'edit') return { kind: 'edit', path, content: body };
    if (type === 'delete') return { kind: 'delete', path };
    return null;
}

/**
 * Strip leading slashes and reject path-traversal attempts. Paths are stored
 * as relative POSIX paths in the virtual file system.
 */
function sanitizePath(p: string): string {
    const trimmed = p.trim().replace(/^\/+/, '').replace(/\\/g, '/');
    if (!trimmed) return '';
    // Reject `..` segments outright — the agent has no business walking up.
    if (trimmed.split('/').some((seg) => seg === '..')) return '';
    return trimmed;
}
