import { ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui';

export function SidebarHeader() {
    return (
        <div className="flex flex-col gap-4 p-3 shrink-0">
            <Button
                variant="outline"
                className="w-full justify-between bg-surface hover:bg-surface-2 border-border text-foreground h-9 font-medium"
            >
                New Chat
                <ChevronDown className="h-4 w-4 text-foreground-muted" />
            </Button>

            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted" />
                <input
                    type="text"
                    placeholder="Search"
                    className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground-muted focus:outline-none pl-9 h-8"
                />
            </div>
        </div>
    );
}
