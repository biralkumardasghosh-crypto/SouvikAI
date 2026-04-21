'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSidebar, EditModeToggle } from '@/components/admin';
import { useAdmin } from '@/hooks/useAdmin';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { isAuthenticated, isEditMode, checkAuth, logout, toggleEditMode, isLoading } = useAdmin();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const check = async () => {
            const authenticated = await checkAuth();
            if (!authenticated) {
                router.push('/adminlogin');
            }
            setChecking(false);
        };
        check();
    }, [checkAuth, router]);

    const handleLogout = async () => {
        await logout();
        router.push('/adminlogin');
    };

    if (checking || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background">
            <AdminSidebar onLogout={handleLogout} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
                    <h2 className="text-lg font-semibold">Administration</h2>
                    <EditModeToggle
                        isEditMode={isEditMode}
                        onToggle={toggleEditMode}
                        disabled={isLoading}
                    />
                </header>
                <main className="flex-1 overflow-auto p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
