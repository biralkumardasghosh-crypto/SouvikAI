'use client';

import {
    PieChart, Pie, Cell,
    LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { AdminAnalyticsData } from '@/types/admin';

interface AnalyticsDashboardProps {
    data: AdminAnalyticsData | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#6366f1'];

export function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
    if (!data) {
        return (
            <div className="flex justify-center p-8 bg-card rounded-lg border border-border">
                <p className="text-muted-foreground">Loading analytics data...</p>
            </div>
        );
    }

    const { modelUsage, dailyUsage, topUsers } = data;

    // Formatting large numbers with commas
    const formatNumber = (num: number) => new Intl.NumberFormat().format(num);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                {/* 1. Model Usage Pie Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Tokens by Model (All-Time)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            {modelUsage.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={modelUsage}
                                            dataKey="tokens"
                                            nameKey="modelName"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={100}
                                            label={(entry) => entry.modelName}
                                        >
                                            {modelUsage.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) => [`${formatNumber(value)} tokens`, 'Usage']}
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                            }}
                                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Daily Token Consumption */}
                <Card>
                    <CardHeader>
                        <CardTitle>Token Consumption (Last 30 Days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            {dailyUsage.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={dailyUsage}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke="hsl(var(--muted-foreground))"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => {
                                                const d = new Date(val);
                                                return `${d.getMonth() + 1}/${d.getDate()}`;
                                            }}
                                        />
                                        <YAxis
                                            stroke="hsl(var(--muted-foreground))"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => {
                                                if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                                                if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                                                return val;
                                            }}
                                        />
                                        <Tooltip
                                            formatter={(value: number) => [`${formatNumber(value)} tokens`, 'Usage']}
                                            labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="tokens"
                                            stroke="hsl(var(--primary))"
                                            strokeWidth={3}
                                            dot={false}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 3. Top Heavy Users Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Highest Usage Users (Heavy Users)</CardTitle>
                </CardHeader>
                <CardContent>
                    {topUsers.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">Rank</th>
                                        <th className="px-6 py-3 font-medium">User Name</th>
                                        <th className="px-6 py-3 font-medium">Email</th>
                                        <th className="px-6 py-3 font-medium text-right">Total Tokens Used</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {topUsers.map((user, idx) => (
                                        <tr key={user.userId} className="hover:bg-muted/50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-muted-foreground">#{idx + 1}</td>
                                            <td className="px-6 py-4 font-medium">{user.name}</td>
                                            <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                                            <td className="px-6 py-4 text-right font-mono text-primary">
                                                {formatNumber(user.tokens)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex justify-center p-8 bg-card rounded-lg border border-border">
                            <p className="text-muted-foreground">No usage data found.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
