'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, BarChart3, MessageSquare, Settings, LogOut, Server, PieChart } from 'lucide-react';
import { Button, Separator } from '@/components/ui';
import { cn } from '@/lib/utils';

interface AdminSidebarProps {
    onLogout: () => void;
}

const navItems = [
    { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/admin/users', icon: Users, label: 'All Users' },
    { href: '/admin/requests', icon: BarChart3, label: 'Requests Today' },
    { href: '/admin/system-prompt', icon: MessageSquare, label: 'System Prompt' },
    { href: '/admin/ai-settings', icon: Settings, label: 'AI Settings' },
    { href: '/admin/models', icon: Server, label: 'Model Configurations' },
    { href: '/admin/analytics', icon: PieChart, label: 'Analytics' },
];

export function AdminSidebar({ onLogout }: AdminSidebarProps) {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-full bg-card border-r border-border w-64">
            <div className="p-4">
                <h1 className="text-xl font-bold">Admin Panel</h1>
                <p className="text-sm text-muted-foreground">Souvik&apos;s AI Management</p>
            </div>

            <Separator />

            <nav className="flex-1 p-2 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link key={item.href} href={item.href}>
                            <div
                                className={cn(
                                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                                    isActive
                                        ? 'bg-accent text-accent-foreground'
                                        : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                <span className="text-sm font-medium">{item.label}</span>
                            </div>
                        </Link>
                    );
                })}
            </nav>

            <Separator />

            <div className="p-2">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={onLogout}
                >
                    <LogOut className="h-5 w-5" />
                    <span className="text-sm font-medium">Logout</span>
                </Button>
            </div>
        </div>
    );
}
