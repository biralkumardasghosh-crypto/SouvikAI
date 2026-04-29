'use client';

import { RequestsChart } from '@/components/admin';
import { useAdmin } from '@/hooks/useAdmin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

export default function AdminRequestsPage() {
    const { chartData, stats } = useAdmin();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Requests Today</h1>
                <p className="text-muted-foreground">View request analytics and patterns</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Total Requests Today</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-4xl font-bold">{stats?.todayRequests || 0}</div>
                    <p className="text-sm text-muted-foreground mt-1">requests processed</p>
                </CardContent>
            </Card>

            <RequestsChart data={chartData} />
        </div>
    );
}
