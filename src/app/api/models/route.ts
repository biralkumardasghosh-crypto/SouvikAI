import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('models')
            .select('*')
            .order('display_name', { ascending: true });

        if (error) {
            console.error('[GET /api/models] fetch error:', error);
            return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedData = (data as any[]).map((model) => ({
            ...model,
            displayName: model.display_name,
        }));

        return NextResponse.json(mappedData);
    } catch (error) {
        console.error('[GET /api/models] exception:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
