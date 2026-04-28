import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    BUILDER_DB_LIMITS,
    deleteWorkspaceFile,
    upsertWorkspaceFile,
} from '@/lib/code-agent/db';

export const runtime = 'nodejs';

interface Ctx {
    params: Promise<{ id: string }>;
}

/**
 * PUT    /api/code/workspaces/[id]/files   { path, content }
 *   Upsert a single file inside a workspace. Used for direct in-editor edits.
 *
 * DELETE /api/code/workspaces/[id]/files   { path }
 *   Remove a file from a workspace.
 *
 * Both routes require the caller to own the workspace (enforced by the
 * helpers + RLS).
 */

export async function PUT(req: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = (await req.json().catch(() => ({}))) as {
            path?: string;
            content?: string;
        };
        const path = (body.path ?? '').trim();
        const content = body.content ?? '';
        if (!path) {
            return NextResponse.json({ error: 'Path is required' }, { status: 400 });
        }
        if (typeof content !== 'string') {
            return NextResponse.json({ error: 'Content must be a string' }, { status: 400 });
        }
        if (content.length > BUILDER_DB_LIMITS.MAX_FILE_BYTES * 2) {
            return NextResponse.json(
                {
                    error: `File exceeds the maximum allowed size of ${BUILDER_DB_LIMITS.MAX_FILE_BYTES.toLocaleString()} bytes.`,
                },
                { status: 413 },
            );
        }

        await upsertWorkspaceFile(supabase, id, user.id, path, content);
        return NextResponse.json({ ok: true });
    } catch (err) {
        const msg = (err as Error)?.message || 'Failed to save file';
        const status = msg === 'Workspace not found' ? 404 : 500;
        console.error('[Builder] PUT /files error:', err);
        return NextResponse.json({ error: msg }, { status });
    }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = (await req.json().catch(() => ({}))) as { path?: string };
        const path = (body.path ?? '').trim();
        if (!path) {
            return NextResponse.json({ error: 'Path is required' }, { status: 400 });
        }
        await deleteWorkspaceFile(supabase, id, user.id, path);
        return NextResponse.json({ ok: true });
    } catch (err) {
        const msg = (err as Error)?.message || 'Failed to delete file';
        const status = msg === 'Workspace not found' ? 404 : 500;
        console.error('[Builder] DELETE /files error:', err);
        return NextResponse.json({ error: msg }, { status });
    }
}
