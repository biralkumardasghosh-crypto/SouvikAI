import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    deleteWorkspaceForUser,
    loadWorkspaceForUser,
    renameWorkspace,
    setWorkspaceActiveFile,
} from '@/lib/code-agent/db';

export const runtime = 'nodejs';

interface Ctx {
    params: Promise<{ id: string }>;
}

/**
 * GET    /api/code/workspaces/[id]   — full workspace (files + messages)
 * PATCH  /api/code/workspaces/[id]   — rename / set active file
 * DELETE /api/code/workspaces/[id]   — delete workspace (cascades children)
 */

export async function GET(_req: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspace = await loadWorkspaceForUser(supabase, id, user.id);
        if (!workspace) {
            return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }
        return NextResponse.json({ workspace });
    } catch (err) {
        console.error('[Builder] GET /workspaces/[id] error:', err);
        return NextResponse.json(
            { error: 'Failed to load workspace' },
            { status: 500 },
        );
    }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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
            title?: string;
            activeFile?: string | null;
        };

        if (typeof body.title === 'string') {
            await renameWorkspace(supabase, id, user.id, body.title);
        }
        if (body.activeFile === null || typeof body.activeFile === 'string') {
            await setWorkspaceActiveFile(supabase, id, user.id, body.activeFile);
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        const msg = (err as Error)?.message || 'Failed to update workspace';
        const status = msg.includes('Title cannot') ? 400 : 500;
        console.error('[Builder] PATCH /workspaces/[id] error:', err);
        return NextResponse.json({ error: msg }, { status });
    }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
    try {
        const { id } = await ctx.params;
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const ok = await deleteWorkspaceForUser(supabase, id, user.id);
        if (!ok) {
            return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[Builder] DELETE /workspaces/[id] error:', err);
        return NextResponse.json(
            { error: 'Failed to delete workspace' },
            { status: 500 },
        );
    }
}
