import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

async function checkAdminAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');
    return !!session?.value;
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
            is_kicked: false,
        })
        .eq('id', userId);

    if (error) {
        return NextResponse.json({ error: 'Failed to unkick user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
