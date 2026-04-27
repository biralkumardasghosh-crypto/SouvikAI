'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui';
import { Settings2, Activity, UserCircle, MessageSquare, Bot, X, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeneralTab } from './tabs/GeneralTab';
import { UsageTab } from './tabs/UsageTab';
import { AccountTab } from './tabs/AccountTab';
import { PreferencesTab } from './tabs/PreferencesTab';
import { PersonalizationTab } from './tabs/AIBehaviorTab';
import { ArchivedChatsTab } from './tabs/ArchivedChatsTab';

interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** If provided, called when the user clicks an archived chat — parent should load it. */
    onOpenArchivedChat?: (sessionId: string) => void;
    /** If set, the modal opens directly on this tab (e.g. 'archived'). */
    initialTab?: string;
}

export function SettingsModal({ open, onOpenChange, onOpenArchivedChat, initialTab }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState(initialTab ?? 'general');

    // Sync initialTab if it changes externally (e.g. "View archived" button click)
    // We use a key-based approach: the parent passes the tab they want.
    // But since initialTab only sets state once, we need an effect for subsequent changes.
    // The simplest pattern: expose setActiveTab via a prop callback isn't needed —
    // instead the parent remounts with a new key or passes a changing initialTab.
    // We handle it by watching initialTab with an effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const staticInitialTab = initialTab;

    // Track the last seen initialTab so we can jump to a new one without remounting.
    const [lastInitialTab, setLastInitialTab] = useState(staticInitialTab);
    if (staticInitialTab !== lastInitialTab) {
        setLastInitialTab(staticInitialTab);
        if (staticInitialTab) setActiveTab(staticInitialTab);
    }

    const tabs = [
        { id: 'general',     name: 'General',           icon: Settings2,    component: () => <GeneralTab onNavigateToArchived={() => setActiveTab('archived')} /> },
        { id: 'ai-behavior', name: 'Personalization',    icon: Bot,          component: PersonalizationTab },
        { id: 'preferences', name: 'Chat Preferences',  icon: MessageSquare, component: PreferencesTab },
        { id: 'usage',       name: 'Usage',             icon: Activity,     component: UsageTab },
        { id: 'account',     name: 'Account',           icon: UserCircle,   component: AccountTab },
        {
            id: 'archived',
            name: 'Archived Chats',
            icon: Archive,
            component: () => (
                <ArchivedChatsTab
                    onOpenChat={(sessionId) => {
                        onOpenArchivedChat?.(sessionId);
                        onOpenChange(false);
                    }}
                />
            ),
        },
    ];

    const activeTabName = tabs.find(t => t.id === activeTab)?.name;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* [&>button]:hidden prevents the default Radix close button from rendering and overlapping our UI */}
            <DialogContent className="max-w-[760px] w-[94vw] p-0 overflow-hidden h-[78vh] max-h-[620px] flex flex-col md:flex-row gap-0 bg-background border border-border [&>button]:hidden rounded-xl shadow-xl">
                <DialogTitle className="sr-only">Settings</DialogTitle>

                {/* Sidebar */}
                <div className="w-full md:w-[200px] flex flex-col flex-shrink-0 pt-0 relative bg-background/50 md:border-r md:border-border/40">
                    <div className="h-11 flex items-center px-3 md:px-4 z-10">
                        <button
                            onClick={() => onOpenChange(false)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
                        >
                            <X className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                    </div>

                    <nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-y-auto px-2 md:px-2 pb-2 md:pb-0 hide-scrollbar">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const isArchived = tab.id === 'archived';
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        'flex-shrink-0 md:w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] transition-colors text-left',
                                        isActive
                                            ? 'bg-muted text-foreground font-medium'
                                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                                        isArchived && !isActive && 'mt-0.5 border-t border-border/30 pt-2'
                                    )}
                                >
                                    <tab.icon className="h-[13px] w-[13px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                                    {tab.name}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-background px-4 py-3 md:px-7 md:py-5">
                    <div className="max-w-2xl mx-auto h-full space-y-4">
                        <h1 className="text-[15px] md:text-base font-medium text-foreground pb-2.5 border-b border-border/60">
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
