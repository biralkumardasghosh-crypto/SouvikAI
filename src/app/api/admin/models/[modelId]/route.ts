import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

async function checkAdminAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');
    return !!session?.value;
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ modelId: string }> }
) {
    try {
        const isAdmin = await checkAdminAuth();
        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { modelId } = await context.params;
        const body = await request.json();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.displayName !== undefined) updates.display_name = body.displayName;
        if (body.is_suspended !== undefined) updates.is_suspended = body.is_suspended;
        if (body.quota_limit !== undefined) updates.quota_limit = body.quota_limit;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        const supabase = await createClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('models')
            .update(updates)
            .eq('id', modelId);

        if (error) {
            console.error('[PUT /api/admin/models/:id] update error:', error);
            return NextResponse.json({ error: 'Failed to update model' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[PUT /api/admin/models/:id] exception:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
