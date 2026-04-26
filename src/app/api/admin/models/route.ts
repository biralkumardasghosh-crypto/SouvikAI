import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get(ADMIN_COOKIE_NAME);
    return isAdminSessionValid(session?.value);
}

export async function GET() {
    try {
        const isAdmin = await checkAdminAuth();
        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createServiceClient();
        const { data, error } = await supabase
            .from('models')
            .select('*')
            .order('display_name', { ascending: true });

        if (error) {
            console.error('[GET /api/admin/models] fetch error:', error);
            return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedData = (data as any[]).map((model) => ({
            ...model,
            displayName: model.display_name,
        }));

        return NextResponse.json(mappedData);
    } catch (error) {
        console.error('[GET /api/admin/models] exception:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
