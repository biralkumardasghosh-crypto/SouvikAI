export interface AdminSettings {
    id: number;
    temperature: number;
    maxTokens: number;
    modelName: string;
    editMode: boolean;
    updatedAt: Date;
}

export interface RequestLog {
    id: string;
    userId: string;
    createdAt: Date;
    status: 'completed' | 'failed' | 'aborted';
}

export interface RequestsChartData {
    hour: string;
    count: number;
}

export interface UserManagementAction {
    type: 'delete' | 'suspend' | 'kick';
    userId: string;
    reason?: string;
    suspendUntil?: Date;
}

export interface AdminDashboardStats {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    todayRequests: number;
}

export interface ModelUsageStat {
    modelName: string;
    tokens: number;
}

export interface DailyUsageStat {
    date: string;
    tokens: number;
}

export interface TopUserStat {
    userId: string;
    name: string;
    email: string;
    tokens: number;
}

export interface AdminAnalyticsData {
    modelUsage: ModelUsageStat[];
    dailyUsage: DailyUsageStat[];
    topUsers: TopUserStat[];
}

export type AdminTab = 'dashboard' | 'users' | 'requests' | 'system-prompt' | 'ai-settings' | 'analytics';
