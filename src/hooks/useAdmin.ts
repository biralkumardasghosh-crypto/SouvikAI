
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { AdminSettings, RequestsChartData, AdminDashboardStats, AdminAnalyticsData } from '@/types/admin';
import { User } from '@/types/auth';
import { ChatSession, Message, AIModel } from '@/types/chat';

export function useAdmin() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [models, setModels] = useState<AIModel[]>([]);
    const [stats, setStats] = useState<AdminDashboardStats | null>(null);
    const [chartData, setChartData] = useState<RequestsChartData[]>([]);
    const [analyticsData, setAnalyticsData] = useState<AdminAnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const checkAuth = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/auth/check', { cache: 'no-store' });
            setIsAuthenticated(response.ok);
            return response.ok;
        } catch {
            setIsAuthenticated(false);
            return false;
        }
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        try {
            const response = await fetch('/api/admin/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await response.json();
            if (response.ok) {
                setIsAuthenticated(true);
                return { success: true, error: null };
            }
            return { success: false, error: data.error };
        } catch {
            return { success: false, error: 'Failed to login' };
        }
    }, []);

    const logout = useCallback(async () => {
        await fetch('/api/admin/auth/logout', { method: 'POST' });
        setIsAuthenticated(false);
    }, []);

    const fetchSettings = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/settings', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setSettings(data);
                setIsEditMode(data.editMode);
            }
        } catch {
            console.error('Failed to fetch settings');
        }
    }, []);

    const updateSettings = useCallback(async (newSettings: Partial<AdminSettings>) => {
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings),
            });
            if (response.ok) {
                const data = await response.json();
                setSettings(data);
                if (newSettings.editMode !== undefined) {
                    setIsEditMode(newSettings.editMode);
                }
                return { success: true };
            }
            return { success: false };
        } catch {
            return { success: false };
        }
    }, []);

    const toggleEditMode = useCallback(async () => {
        return updateSettings({ editMode: !isEditMode });
    }, [isEditMode, updateSettings]);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/users', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch users');
            const data = await response.json();
            setUsers(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const deleteUser = useCallback(async (userId: string, reason: string) => {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            if (response.ok) {
                await fetchUsers();
                return { success: true };
            }
            return { success: false };
        } catch {
            return { success: false };
        }
    }, [fetchUsers]);

    const suspendUser = useCallback(async (userId: string, reason: string, hours: number) => {
        try {
            const suspendUntil = new Date();
            suspendUntil.setHours(suspendUntil.getHours() + hours);

            const response = await fetch(`/api/admin/users/${userId}/suspend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, suspendUntil: suspendUntil.toISOString() }),
            });
            if (response.ok) {
                await fetchUsers();
                return { success: true };
            }
            return { success: false };
        } catch {
            return { success: false };
        }
    }, [fetchUsers]);

    const kickUser = useCallback(async (userId: string) => {
        try {
            const response = await fetch(`/api/admin/users/${userId}/kick`, {
                method: 'POST',
            });
            if (response.ok) {
                await fetchUsers();
                return { success: true };
            }
            return { success: false };
        } catch {
            return { success: false };
        }
    }, [fetchUsers]);

    const unkickUser = useCallback(async (userId: string) => {
        try {
            const response = await fetch(`/api/admin/users/${userId}/unkick`, {
                method: 'POST',
            });
            if (response.ok) {
                await fetchUsers();
                return { success: true };
            }
            return { success: false };
        } catch {
            return { success: false };
        }
    }, [fetchUsers]);

    const fetchModels = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/models', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            setModels(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const updateModel = useCallback(async (modelId: string, updates: Partial<AIModel>) => {
        try {
            const response = await fetch(`/api/admin/models/${modelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (response.ok) {
                await fetchModels();
                return { success: true };
            }
            return { success: false };
        } catch {
            return { success: false };
        }
    }, [fetchModels]);

    const fetchStats = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/stats', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setStats(data);
            }
        } catch {
            console.error('Failed to fetch stats');
        }
    }, []);

    const fetchChartData = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/requests/chart', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setChartData(data);
            }
        } catch {
            console.error('Failed to fetch chart data');
        }
    }, []);

    const fetchSystemPrompt = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/system-prompt', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                return data.content;
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    const updateSystemPrompt = useCallback(async (content: string) => {
        try {
            const response = await fetch('/api/admin/system-prompt', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            return response.ok;
        } catch {
            return false;
        }
    }, []);

    const fetchAnalytics = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/analytics', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setAnalyticsData(data);
            }
        } catch {
            console.error('Failed to fetch analytics');
        }
    }, []);

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);
        await Promise.all([
            fetchSettings(),
            fetchUsers(),
            fetchStats(),
            fetchChartData(),
            fetchModels(),
            fetchAnalytics(),
        ]);
        setIsLoading(false);
    }, [fetchSettings, fetchUsers, fetchStats, fetchChartData, fetchModels, fetchAnalytics]);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        if (isAuthenticated) {
            loadDashboard();
        }
    }, [isAuthenticated, loadDashboard]);

    return {
        isAuthenticated,
        isEditMode,
        settings,
        users,
        stats,
        chartData,
        isLoading,
        checkAuth,
        login,
        logout,
        fetchSettings,
        updateSettings,
        toggleEditMode,
        fetchUsers,
        deleteUser,
        suspendUser,
        kickUser,
        unkickUser,
        fetchStats,
        fetchChartData,
        fetchSystemPrompt,
        updateSystemPrompt,
        loadDashboard,
        models,
        fetchModels,
        updateModel,
        analyticsData,
        fetchAnalytics,
    };
}

