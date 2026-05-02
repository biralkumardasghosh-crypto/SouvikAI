/**
 * Cross-cutting size / rate constants used by both the client (useChat,
 * useBuilderAgent) and the API routes that mirror them server-side.
 *
 * Centralising these prevents the "remember to update both files" trap that
 * led to silent drift between the client cap and the server check.
 */

/** Hard limit: ~10k tokens at 4 chars/token. Prevents quota bypass via huge inputs. */
export const MAX_INPUT_CHARS = 40_000;

/** Per-message slice when replaying chat history into the model. */
export const MAX_HISTORY_CHARS_PER_TURN = 4_000;

/** Last N turns sent back to the model as conversation history. */
export const MAX_CHAT_HISTORY_TURNS = 20;

/** Builder-specific: trim history more aggressively because steps are verbose. */
export const MAX_BUILDER_HISTORY_TURNS = 12;

/** Sliding window for the per-model token quota check. */
export const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours

/** Hard cap on requests per minute per user (across all routes). */
export const RPM_LIMIT = 20;

/** Default token quota when the model row doesn't override it. */
export const DEFAULT_QUOTA_LIMIT = 500_000;

/** NVIDIA fetch timeout for the chat route — fail fast on hung streams. */
export const CHAT_NVIDIA_TIMEOUT_MS = 25_000;

/** NVIDIA fetch timeout for the builder route — agent turns are larger. */
export const BUILDER_NVIDIA_TIMEOUT_MS = 45_000;

/** Google AI fetch timeout for the chat route. */
export const CHAT_GOOGLE_TIMEOUT_MS = 60_000;
