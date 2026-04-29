import { Home, LayoutGrid, MessageSquare, Shapes, LayoutTemplate } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
    { icon: Home, label: 'Home', isActive: true },
    { icon: LayoutGrid, label: 'Projects', isActive: false },
    { icon: MessageSquare, label: 'Chats', isActive: false },
    { icon: Shapes, label: 'Design Systems', isActive: false },
    { icon: LayoutTemplate, label: 'Templates', isActive: false },
];

export function SidebarNav() {
    return (
        <nav className="flex flex-col gap-0.5 px-2 shrink-0">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.label}
                        className={cn(
                            "flex items-center gap-3 px-2 h-9 rounded-md text-[14px] transition-colors",
                            item.isActive 
                                ? "bg-surface-3 text-foreground font-medium" 
                                : "text-[#a3a3a3] hover:text-foreground hover:bg-surface-2"
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
