import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    createWorkspaceForUser,
    listWorkspacesForUser,
} from '@/lib/code-agent/db';

export const runtime = 'nodejs';

const MAX_INITIAL_MESSAGE = 40_000;

/**
 * GET  /api/code/workspaces           — list current user's workspaces
 * POST /api/code/workspaces           — create a new workspace
 *
 * The POST body may include `initialMessage`, in which case the workspace is
 * pre-seeded with that message as the first user turn (so the workspace page
 * can immediately auto-trigger the agent on mount).
 */

export async function GET() {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaces = await listWorkspacesForUser(supabase, user.id);
        return NextResponse.json({ workspaces });
    } catch (err) {
        console.error('[Builder] GET /workspaces error:', err);
        return NextResponse.json(
            { error: 'Failed to load workspaces' },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        // ── CSRF guard (mirrors /api/chat) ───────────────────────────────────
        const origin = req.headers.get('origin');
        const host = req.headers.get('host');
        if (origin && host) {
            try {
                const originHost = new URL(origin).host;
                const norm = (h: string) => h.replace(/:(?:80|443)$/, '');
                if (norm(originHost) !== norm(host)) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            } catch {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = (await req.json().catch(() => ({}))) as {
            initialMessage?: string;
        };

        const initialMessage = (body.initialMessage ?? '').toString();
        if (initialMessage.length > MAX_INITIAL_MESSAGE) {
            return NextResponse.json(
                {
                    error: `Message exceeds the maximum allowed length of ${MAX_INITIAL_MESSAGE.toLocaleString()} characters.`,
                },
                { status: 400 },
            );
        }

        const id = await createWorkspaceForUser(supabase, user.id, {
            initialMessage: initialMessage || undefined,
        });
        return NextResponse.json({ id });
    } catch (err) {
        console.error('[Builder] POST /workspaces error:', err);
        return NextResponse.json(
            { error: 'Failed to create workspace' },
            { status: 500 },
        );
    }
}
