'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, Laptop } from 'lucide-react';
import { useEffect, useState } from 'react';

export function AppearanceTab() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <button
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${theme === 'light'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:bg-white/5'
                        }`}
                >
                    <Sun className={`h-8 w-8 mb-4 ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-medium text-foreground">Light</span>
                </button>

                <button
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${theme === 'dark'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:bg-white/5'
                        }`}
                >
                    <Moon className={`h-8 w-8 mb-4 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-medium text-foreground">Dark</span>
                </button>

                <button
                    onClick={() => setTheme('system')}
                    className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${theme === 'system'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:bg-white/5'
                        }`}
                >
                    <Laptop className={`h-8 w-8 mb-4 ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-medium text-foreground">System</span>
                </button>
            </div>
        </div>
    );
}
