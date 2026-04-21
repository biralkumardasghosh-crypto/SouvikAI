'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { RequestsChart } from '@/components/admin';
import { useAdmin } from '@/hooks/useAdmin';
import { Users, UserCheck, UserX, BarChart3 } from 'lucide-react';

export default function AdminDashboardPage() {
    const { stats, chartData } = useAdmin();

    const statCards = [
        {
            title: 'Total Users',
            value: stats?.totalUsers || 0,
            icon: Users,
            color: 'text-blue-500',
        },
        {
            title: 'Active Users',
            value: stats?.activeUsers || 0,
            icon: UserCheck,
            color: 'text-green-500',
        },
        {
            title: 'Suspended Users',
            value: stats?.suspendedUsers || 0,
            icon: UserX,
            color: 'text-yellow-500',
        },
        {
            title: 'Requests Today',
            value: stats?.todayRequests || 0,
            icon: BarChart3,
            color: 'text-purple-500',
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Overview of your AI platform</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {statCards.map((stat) => (
                    <Card key={stat.title}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <RequestsChart data={chartData} />
        </div>
    );
}
