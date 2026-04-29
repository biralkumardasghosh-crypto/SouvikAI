import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { AdminAnalyticsData, ModelUsageStat, DailyUsageStat, TopUserStat } from '@/types/admin';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');
    return !!session?.value;
}

export async function GET() {
    try {
        const isAdmin = await checkAdminAuth();
        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createServiceClient();

        // 1. Model Usage - Group tokens used by model_id
        // Since Supabase RPC is preferred for aggregations but we don't want to run custom SQL migrations if we don't have to,
        // we can fetch the usage and aggregate in-memory (assuming reasonable table size for this demo), or use PostgREST.
        // We will fetch all from token_usage and aggregate in memory to be safe without deploying new SQL functions.
        const { data: usageData, error: usageError } = await supabase
            .from('token_usage')
            .select('model_id, tokens_used, created_at, user_id, profiles(email)');

        if (usageError || !usageData) {
            console.error('[GET /api/admin/analytics] fetch error:', usageError);
            return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
        }

        const { data: modelsData } = await supabase.from('models').select('id, name, display_name');

        const validModelIds = new Set<string>();
        const reverseNameMap = new Map<string, string>();

        if (modelsData) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const m of modelsData as any[]) {
                validModelIds.add(m.id);
                if (m.name) {
                    reverseNameMap.set(m.name, m.id);
                }
            }
        }

        // Aggregate 1: Model Usage
        const modelMap = new Map<string, number>();

        // Aggregate 2: Daily Usage
        const dailyMap = new Map<string, number>();

        // Aggregate 3: Top Users
        const userMap = new Map<string, TopUserStat>();

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoTime = thirtyDaysAgo.getTime();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of usageData as any[]) {
            // Model Usage
            let targetModelId = row.model_id;

            // Map legacy API model names (e.g. meta/llama-3.1-8b-instruct) back to internal configured IDs
            if (reverseNameMap.has(targetModelId)) {
                targetModelId = reverseNameMap.get(targetModelId)!;
            }

            if (validModelIds.has(targetModelId)) {
                modelMap.set(targetModelId, (modelMap.get(targetModelId) || 0) + row.tokens_used);
            }

            // Daily Usage
            const createdDate = new Date(row.created_at);
            if (createdDate.getTime() >= thirtyDaysAgoTime) {
                // YYYY-MM-DD
                const dateKey = createdDate.toISOString().split('T')[0];
                dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + row.tokens_used);
            }

            // Top Users
            const userId = row.user_id;
            const existing = userMap.get(userId);
            if (existing) {
                existing.tokens += row.tokens_used;
            } else {
                userMap.set(userId, {
                    userId,
                    name: row.profiles?.email?.split('@')[0] || 'Unknown User',
                    email: row.profiles?.email || 'Unknown Email',
                    tokens: row.tokens_used,
                });
            }
        }

        const modelUsage: ModelUsageStat[] = Array.from(modelMap.entries()).map(([modelName, tokens]) => ({
            modelName,
            tokens,
        })).sort((a, b) => b.tokens - a.tokens); // Highest first

        const dailyUsage: DailyUsageStat[] = Array.from(dailyMap.entries()).map(([date, tokens]) => ({
            date,
            tokens,
        })).sort((a, b) => a.date.localeCompare(b.date)); // Chronological

        const topUsers: TopUserStat[] = Array.from(userMap.values())
            .sort((a, b) => b.tokens - a.tokens)
            .slice(0, 10); // Top 10

        const analyticsData: AdminAnalyticsData = {
            modelUsage,
            dailyUsage,
            topUsers,
        };

        return NextResponse.json(analyticsData);
    } catch (error) {
        console.error('[GET /api/admin/analytics] exception:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
