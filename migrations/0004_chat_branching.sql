-- ── Chat Branching ──────────────────────────────────────────────────────────
-- Lets a user "branch" any chat from the 3-dot menu. Branching creates a new
-- chat session that snapshots the source's full message history at the moment
-- of branching, so the user can continue the conversation in a new direction
-- without affecting the original.
--
-- Two columns are added to chat_sessions:
--   • branched_from_session_id — FK back to the source chat. Set to NULL if
--     the source is later deleted, so the branch keeps working as a standalone
--     chat. We never CASCADE-delete branches when the source is deleted.
--   • branched_from_title      — snapshot of the source's title at branch
--     time. Used to render the "Branched from <title>" divider at the top of
--     the new chat. Storing the snapshot means renaming or deleting the
--     source never breaks the divider in the branch.
--
-- Existing rows get NULL for both columns, which the UI treats as "regular,
-- non-branched chat" — no rendering changes for any pre-existing session.

-- 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_sessions
    ADD COLUMN IF NOT EXISTS branched_from_session_id UUID
        REFERENCES public.chat_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.chat_sessions
    ADD COLUMN IF NOT EXISTS branched_from_title TEXT;

-- 2. Index ──────────────────────────────────────────────────────────────────
-- Lets us cheaply look up "all branches of <session>" if/when we surface that
-- in the UI later. Partial index keeps the index small for the common case
-- (most chats are not branches).
CREATE INDEX IF NOT EXISTS idx_chat_sessions_branched_from
    ON public.chat_sessions (branched_from_session_id)
    WHERE branched_from_session_id IS NOT NULL;
