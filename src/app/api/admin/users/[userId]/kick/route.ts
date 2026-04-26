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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = await createServiceClient();

    const { error } = await supabase
        .from('profiles')
        .update({
            is_kicked: true,
        })
        .eq('id', userId);

    if (error) {
        return NextResponse.json({ error: 'Failed to kick user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
