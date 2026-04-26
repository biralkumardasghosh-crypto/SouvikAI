import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get(ADMIN_COOKIE_NAME);
    return isAdminSessionValid(session?.value);
}

export async function GET() {
    if (!(await checkAdminAuth())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServiceClient();

    // Get today's start
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
        .from('requests_log')
        .select('created_at')
        .gte('created_at', today.toISOString());

    // Group by hour
    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
        hourCounts[i] = 0;
    }

    if (data) {
        (data as { created_at: string }[]).forEach((row) => {
            const hour = new Date(row.created_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
    }

    const chartData = Object.entries(hourCounts).map(([hour, count]) => ({
        hour: `${hour.padStart(2, '0')}:00`,
        count,
    }));

    return NextResponse.json(chartData);
}
