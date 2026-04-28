import type { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';
import type {
    BuilderFileAction,
    BuilderFiles,
    BuilderMessage,
    BuilderStep,
    BuilderWorkspace,
    BuilderWorkspaceSummary,
} from '@/types/code';
import { BASE_TEMPLATE, DEFAULT_ACTIVE_FILE } from './template';

/**
 * The cookie-bound server Supabase client. Inferring from the factory keeps
 * the schema generic in sync with whatever `createServerClient<Database>` is
 * configured with — typing it manually as `SupabaseClient<Database>` collapses
 * the table generics to `never` and breaks every `.insert()` / `.update()`.
 */
type DB = Awaited<ReturnType<typeof createClient>>;

type WorkspaceRow = Database['public']['Tables']['builder_workspaces']['Row'];
type FileRow = Database['public']['Tables']['builder_files']['Row'];
type MessageRow = Database['public']['Tables']['builder_messages']['Row'];

const MAX_FILE_BYTES = 256 * 1024; // 256KB per file — guards against runaway model output
const MAX_FILES_PER_WORKSPACE = 200;
const MAX_TITLE_LEN = 200;

/** Truncate a model-emitted file body before persisting. */
function clampContent(content: string): string {
    if (content.length <= MAX_FILE_BYTES) return content;
    return content.slice(0, MAX_FILE_BYTES) + '\n/* [truncated] */\n';
}

function deriveTitle(message: string): string {
    const stripped = message.replace(/\s+/g, ' ').trim();
    if (!stripped) return 'New build';
    const sliced = stripped.length > MAX_TITLE_LEN ? stripped.slice(0, MAX_TITLE_LEN - 1).trimEnd() + '…' : stripped;
    return sliced;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Fetch a workspace's full state (files + chat transcript) for the given user.
 * RLS enforces ownership; we re-check defensively.
 */
export async function loadWorkspaceForUser(
    supabase: DB,
    workspaceId: string,
    userId: string,
): Promise<BuilderWorkspace | null> {
    const [wsRes, filesRes, messagesRes] = await Promise.all([
        supabase
            .from('builder_workspaces')
            .select('*')
            .eq('id', workspaceId)
            .eq('user_id', userId)
            .maybeSingle(),
        supabase
            .from('builder_files')
            .select('path, content')
            .eq('workspace_id', workspaceId)
            .order('path', { ascending: true }),
        supabase
            .from('builder_messages')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: true }),
    ]);

    const ws = wsRes.data as WorkspaceRow | null;
    if (!ws) return null;

    const files: BuilderFiles = {};
    for (const row of (filesRes.data ?? []) as Pick<FileRow, 'path' | 'content'>[]) {
        files[row.path] = row.content;
    }

    const messages: BuilderMessage[] = ((messagesRes.data ?? []) as MessageRow[]).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        steps: Array.isArray(m.steps) ? (m.steps as unknown as BuilderStep[]) : [],
        errored: m.errored,
        createdAt: new Date(m.created_at).getTime(),
    }));

    return {
        id: ws.id,
        title: ws.title,
        files,
        activeFile: ws.active_file,
        messages,
        createdAt: new Date(ws.created_at).getTime(),
        updatedAt: new Date(ws.updated_at).getTime(),
    };
}

/**
 * List a user's workspaces (most recently updated first). Lightweight — does
 * not include files or messages.
 */
export async function listWorkspacesForUser(
    supabase: DB,
    userId: string,
    limit = 50,
): Promise<BuilderWorkspaceSummary[]> {
    const { data, error } = await supabase
        .from('builder_workspaces')
        .select('id, title, active_file, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        activeFile: row.active_file,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
    }));
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Create a fresh workspace pre-loaded with the base Next.js + Tailwind template
 * and (optionally) an initial user message. Returns the new workspace id.
 *
 * Done as three sequential inserts (workspace → files → first message) so the
 * RLS policies on the child tables can verify the parent already exists.
 */
export async function createWorkspaceForUser(
    supabase: DB,
    userId: string,
    opts: { initialMessage?: string } = {},
): Promise<string> {
    const title = opts.initialMessage ? deriveTitle(opts.initialMessage) : 'New build';

    const wsInsert = await supabase
        .from('builder_workspaces')
        .insert({
            user_id: userId,
            title,
            active_file: DEFAULT_ACTIVE_FILE,
        })
        .select('id')
        .single();

    if (wsInsert.error || !wsInsert.data) {
        throw wsInsert.error ?? new Error('Failed to create workspace');
    }
    const workspaceId = (wsInsert.data as { id: string }).id;

    // Seed the virtual filesystem with the starter template.
    const fileRows = Object.entries(BASE_TEMPLATE).map(([path, content]) => ({
        workspace_id: workspaceId,
        path,
        content,
    }));
    const filesInsert = await supabase.from('builder_files').insert(fileRows);
    if (filesInsert.error) {
        // Roll back — the workspace is empty / orphaned otherwise.
        await supabase.from('builder_workspaces').delete().eq('id', workspaceId);
        throw filesInsert.error;
    }

    if (opts.initialMessage && opts.initialMessage.trim()) {
        const msgInsert = await supabase.from('builder_messages').insert({
            workspace_id: workspaceId,
            user_id: userId,
            role: 'user',
            content: opts.initialMessage.trim(),
            steps: [],
        });
        if (msgInsert.error) {
            await supabase.from('builder_workspaces').delete().eq('id', workspaceId);
            throw msgInsert.error;
        }
    }

    return workspaceId;
}

export async function deleteWorkspaceForUser(
    supabase: DB,
    workspaceId: string,
    userId: string,
): Promise<boolean> {
    const { error, count } = await supabase
        .from('builder_workspaces')
        .delete({ count: 'exact' })
        .eq('id', workspaceId)
        .eq('user_id', userId);

    if (error) throw error;
    return (count ?? 0) > 0;
}

export async function renameWorkspace(
    supabase: DB,
    workspaceId: string,
    userId: string,
    title: string,
): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) throw new Error('Title cannot be empty');
    const safe = trimmed.length > MAX_TITLE_LEN ? trimmed.slice(0, MAX_TITLE_LEN) : trimmed;
    const { error } = await supabase
        .from('builder_workspaces')
        .update({ title: safe })
        .eq('id', workspaceId)
        .eq('user_id', userId);
    if (error) throw error;
}

export async function setWorkspaceActiveFile(
    supabase: DB,
    workspaceId: string,
    userId: string,
    path: string | null,
): Promise<void> {
    const { error } = await supabase
        .from('builder_workspaces')
        .update({ active_file: path })
        .eq('id', workspaceId)
        .eq('user_id', userId);
    if (error) throw error;
}

/**
 * Apply a single agent file action to the database. Idempotent for create/edit
 * (upsert by composite key); silent no-op when deleting a non-existent path.
 */
export async function applyFileAction(
    supabase: DB,
    workspaceId: string,
    action: BuilderFileAction,
): Promise<void> {
    if (action.kind === 'delete') {
        const { error } = await supabase
            .from('builder_files')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('path', action.path);
        if (error) throw error;
        return;
    }

    // Cap the workspace size to avoid runaway models exhausting storage.
    if (action.kind === 'create') {
        const { count, error: cErr } = await supabase
            .from('builder_files')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId);
        if (cErr) throw cErr;
        if ((count ?? 0) >= MAX_FILES_PER_WORKSPACE) {
            // Upsert on existing path is OK; new path is rejected.
            const { data: existing, error: exErr } = await supabase
                .from('builder_files')
                .select('id')
                .eq('workspace_id', workspaceId)
                .eq('path', action.path)
                .maybeSingle();
            if (exErr) throw exErr;
            if (!existing) {
                throw new Error(
                    `Workspace file limit reached (${MAX_FILES_PER_WORKSPACE}). Delete unused files before adding more.`,
                );
            }
        }
    }

    const content = clampContent(action.content);
    const { error } = await supabase
        .from('builder_files')
        .upsert(
            { workspace_id: workspaceId, path: action.path, content },
            { onConflict: 'workspace_id,path' },
        );
    if (error) throw error;
}

/**
 * Persist a single chat message (user or assistant). For assistant messages,
 * `steps` carries the timeline (milestones + applied actions).
 *
 * Returns the database-assigned id so the client can replace any optimistic
 * placeholder.
 */
export async function insertBuilderMessage(
    supabase: DB,
    args: {
        workspaceId: string;
        userId: string;
        role: 'user' | 'assistant';
        content: string;
        steps?: BuilderStep[];
        errored?: boolean;
    },
): Promise<string> {
    const { data, error } = await supabase
        .from('builder_messages')
        .insert({
            workspace_id: args.workspaceId,
            user_id: args.userId,
            role: args.role,
            content: args.content,
            steps: (args.steps ?? []) as unknown as Database['public']['Tables']['builder_messages']['Insert']['steps'],
            errored: !!args.errored,
        })
        .select('id')
        .single();
    if (error || !data) throw error ?? new Error('Failed to insert builder message');
    return (data as { id: string }).id;
}

/**
 * Update the contents of a single file in a workspace. Used by the editor's
 * direct text edits. Creates the row if it doesn't exist.
 */
export async function upsertWorkspaceFile(
    supabase: DB,
    workspaceId: string,
    userId: string,
    path: string,
    content: string,
): Promise<void> {
    // Ownership guard — RLS handles this too, but a single explicit query
    // gives us a clean 404 / 403 path on mismatch.
    const { data: ws } = await supabase
        .from('builder_workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!ws) throw new Error('Workspace not found');

    const { error } = await supabase
        .from('builder_files')
        .upsert(
            { workspace_id: workspaceId, path, content: clampContent(content) },
            { onConflict: 'workspace_id,path' },
        );
    if (error) throw error;
}

export async function deleteWorkspaceFile(
    supabase: DB,
    workspaceId: string,
    userId: string,
    path: string,
): Promise<void> {
    const { data: ws } = await supabase
        .from('builder_workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!ws) throw new Error('Workspace not found');

    const { error } = await supabase
        .from('builder_files')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('path', path);
    if (error) throw error;
}

export const BUILDER_DB_LIMITS = {
    MAX_FILE_BYTES,
    MAX_FILES_PER_WORKSPACE,
    MAX_TITLE_LEN,
};
