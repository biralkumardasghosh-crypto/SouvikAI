import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');
    return !!session?.value;
}

export async function GET() {
    if (!(await checkAdminAuth())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServiceClient();

    // Get total users
    const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

    // Get active users (not deleted, not kicked, not suspended)
    const { count: activeUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .eq('is_kicked', false)
        .or('suspended_until.is.null,suspended_until.lt.now()');

    // Get suspended users
    const { count: suspendedUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gt('suspended_until', new Date().toISOString());

    // Get today's requests
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayRequests } = await supabase
        .from('requests_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

    return NextResponse.json({
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        suspendedUsers: suspendedUsers || 0,
        todayRequests: todayRequests || 0,
    });
}
