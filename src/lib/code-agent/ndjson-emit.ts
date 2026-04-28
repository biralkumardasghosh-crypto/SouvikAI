import type { BuilderStreamEvent } from '@/types/code';

/**
 * Helpers for the agent route's NDJSON wire format. Each event is encoded
 * as one JSON object per line — chosen over SSE because the existing client
 * (useBuilderAgent) already parses NDJSON for the workspace stream.
 */
const _encoder = new TextEncoder();

export function encodeEvent(ev: BuilderStreamEvent): Uint8Array {
    return _encoder.encode(JSON.stringify(ev) + '\n');
}

/**
 * Stable-but-unique id for timeline steps. Combines the wall clock with
 * randomness so concurrent agent runs don't collide and the order matches
 * insertion order when sorting by id alone.
 */
export function genStepId(): string {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
