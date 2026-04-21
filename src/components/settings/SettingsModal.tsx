'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui';
import { Settings2, Activity, UserCircle, MessageSquare, Bot, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeneralTab } from './tabs/GeneralTab';
import { UsageTab } from './tabs/UsageTab';
import { AccountTab } from './tabs/AccountTab';
import { PreferencesTab } from './tabs/PreferencesTab';
import { AIBehaviorTab } from './tabs/AIBehaviorTab';

interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState('general');

    const tabs = [
        { id: 'general',     name: 'General',          icon: Settings2,    component: GeneralTab },
        { id: 'ai-behavior', name: 'AI Behavior',       icon: Bot,          component: AIBehaviorTab },
        { id: 'preferences', name: 'Chat Preferences',  icon: MessageSquare, component: PreferencesTab },
        { id: 'usage',       name: 'Usage',             icon: Activity,     component: UsageTab },
        { id: 'account',     name: 'Account',           icon: UserCircle,   component: AccountTab },
    ];

    const activeTabName = tabs.find(t => t.id === activeTab)?.name;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* [&>button]:hidden prevents the default Radix close button from rendering and overlapping our UI */}
            <DialogContent className="max-w-[900px] w-[95vw] p-0 overflow-hidden h-[85vh] max-h-[750px] flex flex-col md:flex-row gap-0 bg-background border border-border [&>button]:hidden rounded-2xl shadow-xl">
                <DialogTitle className="sr-only">Settings</DialogTitle>

                {/* Sidebar */}
                <div className="w-full md:w-[260px] flex flex-col flex-shrink-0 pt-0 relative bg-background/50">
                    <div className="h-16 flex items-center px-4 md:px-6 z-10">
                        <button
                            onClick={() => onOpenChange(false)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
                        >
                            <X className="h-5 w-5 md:h-6 md:w-6" strokeWidth={1.5} />
                        </button>
                    </div>

                    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto px-4 md:px-3 pb-4 md:pb-0 hide-scrollbar">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        'flex-shrink-0 md:w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                                        isActive
                                            ? 'bg-muted text-foreground font-medium'
                                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                    )}
                                >
                                    <tab.icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2 : 1.5} />
                                    {tab.name}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-background px-6 py-4 md:px-10 md:py-8">
                    <div className="max-w-2xl mx-auto h-full space-y-6">
                        <h1 className="text-xl md:text-[22px] font-medium text-foreground pb-4 border-b border-border/60">
                            {activeTabName}
                        </h1>

                        <div className="animate-in fade-in duration-300">
                            {tabs.map((tab) => {
                                const TabComponent = tab.component;
                                return activeTab === tab.id ? <TabComponent key={tab.id} /> : null;
                            })}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
