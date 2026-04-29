import { NextRequest, NextResponse } from 'next/server';
import { searchWeb } from '@/lib/web-search';

/**
 * GET /api/tools/web-search?q=<query>
 * Thin HTTP wrapper around the shared searchWeb() helper.
 * No auth required — only callable from the same origin (chat route).
 */
export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get('q')?.trim();

    if (!query) {
        return NextResponse.json(
            { error: 'Query parameter "q" is required' },
            { status: 400 },
        );
    }

    try {
        const data = await searchWeb(query);
        return NextResponse.json(data);
    } catch (error) {
        console.error('[Web Search API] Error:', error);
        // Return empty results rather than 500 so callers degrade gracefully
        return NextResponse.json({ query, results: [] });
    }
}
