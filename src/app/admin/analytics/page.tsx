'use client';

import { useAdmin } from '@/hooks/useAdmin';
import { AnalyticsDashboard } from '@/components/admin';

export default function AdminAnalyticsPage() {
    const { analyticsData, isLoading } = useAdmin();

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <p className="text-muted-foreground">Loading analytics...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Analytics & Tracking</h1>
                <p className="text-muted-foreground">
                    Monitor model usage, token consumption, and heavy users.
                </p>
            </div>

            <AnalyticsDashboard data={analyticsData} />
        </div>
    );
}
