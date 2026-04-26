import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from '@/lib/admin-auth';

async function checkAdminAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get(ADMIN_COOKIE_NAME);
    return isAdminSessionValid(session?.value);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    if (!(await checkAdminAuth())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;
    const { reason, suspendUntil } = await request.json();

    if (!reason || !suspendUntil) {
        return NextResponse.json({ error: 'Reason and suspend until are required' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServiceClient();

    const { error } = await supabase
        .from('profiles')
        .update({
            suspended_until: suspendUntil,
            suspension_reason: reason,
        })
        .eq('id', userId);

    if (error) {
        return NextResponse.json({ error: 'Failed to suspend user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
