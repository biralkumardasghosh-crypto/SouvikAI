-- ── Forge (Builder) Workspaces ──────────────────────────────────────────────
-- Persists the in-browser code-agent ("Forge") workspaces in Supabase so the
-- user's projects, files, and conversation survive across devices and reloads.
--
-- Schema:
--   builder_workspaces  — top-level container (one per "build")
--   builder_files       — virtual filesystem (path, content) per workspace
--   builder_messages    — chat transcript (with milestone/action steps)
--
-- All three are scoped to the owning user via RLS, with cascade-delete from
-- the workspace down to its files and messages.

-- 1. workspaces ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.builder_workspaces (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL DEFAULT 'New build'
                     CHECK (char_length(btrim(title)) > 0
                            AND char_length(title) <= 200),
    active_file  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_workspaces_user_updated
    ON public.builder_workspaces (user_id, updated_at DESC);

-- 2. files ───────────────────────────────────────────────────────────────────
-- Virtual filesystem. Path uniqueness is scoped to the workspace.
CREATE TABLE IF NOT EXISTS public.builder_files (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES public.builder_workspaces(id) ON DELETE CASCADE,
    path          TEXT NOT NULL
                      CHECK (char_length(btrim(path)) > 0
                             AND char_length(path) <= 1024),
    content       TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, path)
);

CREATE INDEX IF NOT EXISTS idx_builder_files_workspace
    ON public.builder_files (workspace_id);

-- 3. messages ────────────────────────────────────────────────────────────────
-- Each row is one chat turn. `steps` stores the timeline (milestones + actions)
-- as JSONB so the UI can replay the agent's "thinking" timeline on reload.
CREATE TABLE IF NOT EXISTS public.builder_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES public.builder_workspaces(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content       TEXT NOT NULL DEFAULT '',
    steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
    errored       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_messages_workspace_created
    ON public.builder_messages (workspace_id, created_at ASC);

-- 4. updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_builder_workspaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS builder_workspaces_set_updated_at
    ON public.builder_workspaces;
CREATE TRIGGER builder_workspaces_set_updated_at
    BEFORE UPDATE ON public.builder_workspaces
    FOR EACH ROW EXECUTE FUNCTION public.touch_builder_workspaces_updated_at();

CREATE OR REPLACE FUNCTION public.touch_builder_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    -- Bubble the change up to the parent workspace so it sorts to the top
    -- of the list as soon as any file inside it is edited.
    UPDATE public.builder_workspaces
        SET updated_at = now()
        WHERE id = NEW.workspace_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS builder_files_set_updated_at
    ON public.builder_files;
CREATE TRIGGER builder_files_set_updated_at
    BEFORE UPDATE ON public.builder_files
    FOR EACH ROW EXECUTE FUNCTION public.touch_builder_files_updated_at();

-- 5. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.builder_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_files      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_messages   ENABLE ROW LEVEL SECURITY;

-- ── workspaces: owner-only ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "builder_workspaces_owner_select" ON public.builder_workspaces;
CREATE POLICY "builder_workspaces_owner_select"
    ON public.builder_workspaces FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "builder_workspaces_owner_insert" ON public.builder_workspaces;
CREATE POLICY "builder_workspaces_owner_insert"
    ON public.builder_workspaces FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "builder_workspaces_owner_update" ON public.builder_workspaces;
CREATE POLICY "builder_workspaces_owner_update"
    ON public.builder_workspaces FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "builder_workspaces_owner_delete" ON public.builder_workspaces;
CREATE POLICY "builder_workspaces_owner_delete"
    ON public.builder_workspaces FOR DELETE
    USING (auth.uid() = user_id);

-- ── files: scoped through the parent workspace ──────────────────────────────
DROP POLICY IF EXISTS "builder_files_owner_select" ON public.builder_files;
CREATE POLICY "builder_files_owner_select"
    ON public.builder_files FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.builder_workspaces w
            WHERE w.id = builder_files.workspace_id
              AND w.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "builder_files_owner_insert" ON public.builder_files;
CREATE POLICY "builder_files_owner_insert"
    ON public.builder_files FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.builder_workspaces w
            WHERE w.id = builder_files.workspace_id
              AND w.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "builder_files_owner_update" ON public.builder_files;
CREATE POLICY "builder_files_owner_update"
    ON public.builder_files FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.builder_workspaces w
            WHERE w.id = builder_files.workspace_id
              AND w.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.builder_workspaces w
            WHERE w.id = builder_files.workspace_id
              AND w.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "builder_files_owner_delete" ON public.builder_files;
CREATE POLICY "builder_files_owner_delete"
    ON public.builder_files FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.builder_workspaces w
            WHERE w.id = builder_files.workspace_id
              AND w.user_id = auth.uid()
    ));

-- ── messages: scoped through the parent workspace ───────────────────────────
DROP POLICY IF EXISTS "builder_messages_owner_select" ON public.builder_messages;
CREATE POLICY "builder_messages_owner_select"
    ON public.builder_messages FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "builder_messages_owner_insert" ON public.builder_messages;
CREATE POLICY "builder_messages_owner_insert"
    ON public.builder_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.builder_workspaces w
                WHERE w.id = builder_messages.workspace_id
                  AND w.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "builder_messages_owner_update" ON public.builder_messages;
CREATE POLICY "builder_messages_owner_update"
    ON public.builder_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "builder_messages_owner_delete" ON public.builder_messages;
CREATE POLICY "builder_messages_owner_delete"
    ON public.builder_messages FOR DELETE
    USING (auth.uid() = user_id);
