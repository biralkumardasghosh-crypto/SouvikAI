-- ── Projects ────────────────────────────────────────────────────────────────
-- A "project" groups related chat sessions together. A user can create,
-- rename, and delete projects from the sidebar. Each chat session can
-- optionally belong to one project (one-to-many: project → sessions).
--
-- When a project is deleted, its sessions are NOT removed; their `project_id`
-- is set back to NULL so the user keeps the conversation history but the
-- chats fall back into the regular chat list.

-- 1. projects table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL
                    CHECK (char_length(btrim(name)) > 0
                           AND char_length(name) <= 120),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sidebar lists the user's projects ordered by recency.
CREATE INDEX IF NOT EXISTS idx_projects_user_updated
    ON public.projects (user_id, updated_at DESC);

-- 2. project_id column on chat_sessions ─────────────────────────────────────
ALTER TABLE public.chat_sessions
    ADD COLUMN IF NOT EXISTS project_id UUID
        REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_project
    ON public.chat_sessions (project_id)
    WHERE project_id IS NOT NULL;

-- 3. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.touch_projects_updated_at();

-- 4. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_owner_select" ON public.projects;
CREATE POLICY "projects_owner_select"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_owner_insert" ON public.projects;
CREATE POLICY "projects_owner_insert"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_owner_update" ON public.projects;
CREATE POLICY "projects_owner_update"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "projects_owner_delete" ON public.projects;
CREATE POLICY "projects_owner_delete"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id);
