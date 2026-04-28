/**
 * Streaming parser that converts a raw model output stream into a sequence of
 * {@link BuilderStreamEvent}s.
 *
 * The set of recognised tags lives entirely in the tool registry under
 * {@link ./tools}. Each tool exports its own tag-start pattern and a
 * `parse(rest, final)` method, so adding new tools does not require editing
 * this file.
 *
 * Behaviour:
 *   • Anything outside a tag is emitted as `{ type: 'text', delta: ... }`.
 *   • A `<` that *might* be the start of a tag is held back until we have
 *     enough buffer to decide.
 *   • Stray closing tags or malformed tags are silently dropped (the model
 *     occasionally emits these and we don't want to surface them as text).
 */
import type { BuilderFileAction, BuilderStreamEvent } from '@/types/code';
import { PARSEABLE_TOOLS } from './tools';
import { parseAttrs, sanitizePath } from './tools/utils';

export class BuilderTagStreamParser {
    private buffer = '';
    /**
     * True once we've already emitted an `action-start` event for the
     * `<action>` open tag currently sitting at the head of the buffer.
     * Reset whenever we successfully consume a tag (or the buffer no longer
     * starts with that tag), so we never announce the same tag twice.
     */
    private pendingActionAnnounced = false;

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

            // No recognised tag start in the buffer.
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
                this.pendingActionAnnounced = false;
                break;
            }

            const parsed = this.tryParseTagAt(tagStart, final);
            if (!parsed) {
                // Tag is starting but not yet complete. Emit any preceding
                // text and hold the partial tag for the next chunk.
                if (tagStart > 0) {
                    events.push({ type: 'text', delta: this.buffer.slice(0, tagStart) });
                    this.buffer = this.buffer.slice(tagStart);
                }

                // If this is an `<action>` whose open tag has fully streamed
                // (`<action ... type=".." path="..">`) but whose body /
                // `</action>` hasn't, surface an early `action-start` so the
                // timeline can show "Editing X…" instead of going silent for
                // the duration of the file write.
                if (!this.pendingActionAnnounced) {
                    const announce = peekActionStart(this.buffer);
                    if (announce) {
                        events.push(announce);
                        this.pendingActionAnnounced = true;
                    }
                }
                break;
            }

            // Emit prefix text, then the tag event, then advance past it.
            if (tagStart > 0) {
                events.push({ type: 'text', delta: this.buffer.slice(0, tagStart) });
            }
            if (parsed.event) events.push(parsed.event);
            this.buffer = this.buffer.slice(parsed.consumed);
            this.pendingActionAnnounced = false;
        }

        return events;
    }

    /**
     * Returns the smallest index in the buffer where any registered tool's
     * tag begins, or -1 if there's no candidate. The patterns each tool
     * exports are required to be `/g/i` and to match a tag-start only (e.g.
     * the `<milestone[\s>/]` prefix), so we don't false-match identifiers
     * like `<milestoneList>` or `<actionable>`.
     */
    private findNextTagStart(): number {
        let earliest = -1;
        // Stray closing milestone tags are detected here too so we can drop
        // them inside `tryParseTagAt`. (No tool owns </milestone> on its own.)
        const strayClose = /<\/milestone>/gi;

        for (const tool of PARSEABLE_TOOLS) {
            tool.tagStartPattern.lastIndex = 0;
            const m = tool.tagStartPattern.exec(this.buffer);
            if (m && (earliest === -1 || m.index < earliest)) earliest = m.index;
        }
        strayClose.lastIndex = 0;
        const sc = strayClose.exec(this.buffer);
        if (sc && (earliest === -1 || sc.index < earliest)) earliest = sc.index;

        return earliest;
    }

    /**
     * Attempts to parse a complete tag starting at `idx`. Walks the tool
     * registry in order and returns the first tool that reports `complete`
     * or `partial`. Returns:
     *
     *   • `{ event, consumed }` when a full tag was parsed (event may be
     *     null when the tag was malformed and should be silently dropped).
     *   • `null` when a tag is starting but not yet complete — the caller
     *     should buffer more input.
     */
    private tryParseTagAt(
        idx: number,
        final: boolean,
    ): { event: BuilderStreamEvent | null; consumed: number } | null {
        const rest = this.buffer.slice(idx);

        for (const tool of PARSEABLE_TOOLS) {
            const r = tool.parse(rest, final);
            if (r.status === 'complete') {
                return { event: r.event, consumed: idx + r.consumed };
            }
            if (r.status === 'partial') {
                return null;
            }
        }

        // No tool recognised the tag at this index — but stray closing tags
        // may still need to be dropped to keep them out of user-visible text.
        if (/^<\/milestone>/i.test(rest)) {
            return { event: null, consumed: idx + '</milestone>'.length };
        }

        // Truly unknown — emit the `<` as text and advance one char.
        return { event: { type: 'text', delta: '<' }, consumed: idx + 1 };
    }
}

/**
 * If `rest` starts with a fully-formed but un-closed `<action ...>` open tag,
 * return an `action-start` event built from its `type` + `path` attributes.
 *
 *   • Self-closing forms (`<action ... />`) are skipped — they're already
 *     complete actions and will be parsed normally.
 *   • Tags missing `path` or with an unrecognised `type` are skipped.
 *
 * The event is purely advisory: the matching `action` event still fires from
 * the regular parser path once `</action>` arrives, and only that event
 * actually mutates the workspace.
 */
function peekActionStart(rest: string): BuilderStreamEvent | null {
    const m = /^<action([^>]*)>/i.exec(rest);
    if (!m) return null;
    if (m[1].trim().endsWith('/')) return null; // self-closing — handled elsewhere

    const attrs = parseAttrs(m[1]);
    const kind = (attrs.type || '').toLowerCase() as BuilderFileAction['kind'];
    if (kind !== 'create' && kind !== 'edit' && kind !== 'delete' && kind !== 'rename') {
        return null;
    }

    // For `rename`, the action has `from`/`to`, not `path` — skip.
    const path = sanitizePath(attrs.path || '');
    if (!path) return null;

    return { type: 'action-start', kind, path };
}
