'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Plus,
    MessageSquare,
    Trash2,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    X,
    Search,
    Image,
    Grid2X2,
    Code2,
    MoreHorizontal,
    Pin,
    Archive,
    Settings,
} from 'lucide-react';
import {
    Button,
    Separator,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Avatar,
    AvatarFallback,
} from '@/components/ui';
import { ChatSession } from '@/types/chat';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { formatRelativeTime } from '@/utils/date-helpers';

interface SidebarProps {
    sessions: ChatSession[];
    currentSessionId: string | null;
    onNewChat: () => void;
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
    onPinSession: (sessionId: string) => void;
    onArchiveSession: (sessionId: string) => void;
    onSearch: () => void;
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

const NAV_ITEMS = [
    { icon: Plus, label: 'New chat', action: 'new-chat' as const },
    { icon: Search, label: 'Search chats', action: 'search' as const },
    { icon: Image, label: 'Images', action: 'images' as const },
    { icon: Grid2X2, label: 'Apps', action: 'apps' as const },
    { icon: Code2, label: 'Codex', action: 'codex' as const },
];

interface ChatListItemProps {
    session: ChatSession;
    isActive: boolean;
    onSelect: () => void;
    onPin: () => void;
    onArchive: () => void;
    onDelete: () => void;
}

function ChatListItem({ session, isActive, onSelect, onPin, onArchive, onDelete }: ChatListItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const openMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
        setMenuOpen(o => !o);
    };

    return (
        <>
            <div
                className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 text-sm',
                    isActive
                        ? 'bg-white/10 text-foreground'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                )}
                onClick={onSelect}
            >
                {session.isPinned
                    ? <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60 rotate-45" />
                    : <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                }

                <div className="flex-1 min-w-0">
                    <p className="truncate leading-none text-xs font-medium">{session.title}</p>
                </div>

                <button
                    ref={btnRef}
                    onClick={openMenu}
                    className={cn(
                        'shrink-0 h-5 w-5 flex items-center justify-center rounded-md transition-colors',
                        menuOpen
                            ? 'bg-white/15 text-foreground'
                            : 'text-muted-foreground/50 hover:bg-white/10 hover:text-foreground'
                    )}
                    title="Options"
                >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
            </div>

            {menuOpen && (
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                    className="min-w-[156px] bg-[#2a2a2a] rounded-xl border border-white/10 shadow-2xl py-1"
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); onPin(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                        <Pin className="h-3.5 w-3.5 rotate-45" />
                        {session.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onArchive(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                    </button>
                    <div className="my-1 h-px bg-white/10" />
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </button>
                </div>
            )}
        </>
    );
}

export function Sidebar({
    sessions,
    currentSessionId,
    onNewChat,
    onSelectSession,
    onDeleteSession,
    onPinSession,
    onArchiveSession,
    onSearch,
    isMobileOpen = false,
    onMobileClose,
}: SidebarProps) {
    const { user, signOut } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [isDragging, setIsDragging] = useState(false);
    const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
    const initial = displayName.charAt(0).toUpperCase();

    const MIN_WIDTH = 180;
    const MAX_WIDTH = 480;

    const startDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        const startX = e.clientX;
        const startWidth = sidebarWidth;

        const onMouseMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta)));
        };
        const onMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [sidebarWidth]);

    return (
        <>
            {/* ── Mobile overlay ── */}
            {isMobileOpen && (
                <div className="sidebar-overlay md:hidden" onClick={onMobileClose} />
            )}

            {/* ── Mobile sidebar drawer ── */}
            {isMobileOpen && (
                <div className="sidebar-drawer md:hidden w-[260px] bg-[#171717] flex flex-col h-full safe-top safe-bottom">
                    <div className="flex items-center justify-between p-3 border-b border-border/30">
                        <div className="flex items-center gap-2 text-foreground">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2C6.477 2 2 6.27 2 11.5c0 2.37.93 4.53 2.46 6.14L3 21.75l4.45-1.45A10.1 10.1 0 0 0 12 21c5.523 0 10-4.27 10-9.5S17.523 2 12 2Z" fill="currentColor" />
                            </svg>
                            <span className="font-semibold">SouvikAI</span>
                        </div>
                        <Button variant="ghost" size="icon" className="touch-target" onClick={onMobileClose}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                    <nav className="px-2 py-2 space-y-0.5">
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.action}
                                    onClick={item.action === 'new-chat' ? onNewChat : undefined}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                    <Separator className="bg-border/30" />
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-1">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 text-sm touch-target',
                                    currentSessionId === session.id
                                        ? 'bg-white/10 text-foreground'
                                        : 'hover:bg-white/5 text-muted-foreground hover:text-foreground'
                                )}
                                onClick={() => onSelectSession(session.id)}
                            >
                                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-xs font-medium">{session.title}</p>
                                    <p className="text-[10px] text-muted-foreground/60">{formatRelativeTime(session.updatedAt)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Separator className="bg-border/30" />
                    <div className="p-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left">
                                    <Avatar className="h-7 w-7 border border-border/40 shrink-0">
                                        <AvatarFallback className="bg-[#4a4a4a] text-white text-xs font-medium">
                                            {initial}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate text-foreground leading-none">{displayName}</p>
                                    </div>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52 bg-[#2a2a2a] border-border/40" sideOffset={8}>
                                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border/40 mb-1">
                                    {user?.email}
                                </div>
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        setIsSettingsOpen(true);
                                    }}
                                    className="cursor-pointer text-sm mb-1"
                                >
                                    <Settings className="mr-2 h-4 w-4" />
                                    Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => signOut()}
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-sm"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            )}

            {/* ── Desktop sidebar ── */}
            {/* Outer wrapper: holds the width, positions the drag handle via relative */}
            <div
                className="hidden md:block md:relative md:flex-shrink-0 h-full"
                style={{ width: isCollapsed ? 60 : sidebarWidth }}
            >
                {/* Inner content: fully clipped, never overflows */}
                <div className="flex flex-col w-full h-full bg-[#171717] border-r border-border/20 overflow-hidden">

                    {/* Top: logo + collapse toggle */}
                    <div className={cn('flex items-center px-3 pt-3 pb-2', isCollapsed ? 'justify-center flex-col gap-3' : 'justify-between')}>
                        {!isCollapsed && (
                            <div className="flex items-center gap-2 text-foreground">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2C6.477 2 2 6.27 2 11.5c0 2.37.93 4.53 2.46 6.14L3 21.75l4.45-1.45A10.1 10.1 0 0 0 12 21c5.523 0 10-4.27 10-9.5S17.523 2 12 2Z" fill="currentColor" />
                                </svg>
                                <span className="text-base font-semibold tracking-tight">SouvikAI</span>
                            </div>
                        )}
                        {isCollapsed && (
                            <div className="text-foreground">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2C6.477 2 2 6.27 2 11.5c0 2.37.93 4.53 2.46 6.14L3 21.75l4.45-1.45A10.1 10.1 0 0 0 12 21c5.523 0 10-4.27 10-9.5S17.523 2 12 2Z" fill="currentColor" />
                                </svg>
                            </div>
                        )}
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-white/5"
                            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                        </button>
                    </div>

                    {/* Nav items */}
                    <nav className="px-2 space-y-0.5 mt-1">
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const isNewChat = item.action === 'new-chat';
                            const isSearch = item.action === 'search';
                            return (
                                <button
                                    key={item.action}
                                    onClick={isNewChat ? onNewChat : isSearch ? onSearch : undefined}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-150',
                                        isCollapsed && 'justify-center'
                                    )}
                                    title={isCollapsed ? item.label : undefined}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    {!isCollapsed && (
                                        <span className="flex-1 text-left">{item.label}</span>
                                    )}
                                    {!isCollapsed && isSearch && (
                                        <kbd className="text-[10px] font-mono text-muted-foreground/50 bg-white/5 border border-white/10 rounded px-1 py-0.5">
                                            ⌘K
                                        </kbd>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <Separator className="bg-border/30 my-2" />

                    {/* Chat history — plain div with overflow-x-hidden guarantees no bleed */}
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2">
                        {!isCollapsed && sessions.length > 0 && (
                            <div className="py-1 space-y-0.5 w-full">
                                {sessions.map((session) => (
                                    <ChatListItem
                                        key={session.id}
                                        session={session}
                                        isActive={currentSessionId === session.id}
                                        onSelect={() => onSelectSession(session.id)}
                                        onPin={() => onPinSession(session.id)}
                                        onArchive={() => onArchiveSession(session.id)}
                                        onDelete={() => onDeleteSession(session.id)}
                                    />
                                ))}
                            </div>
                        )}
                        {isCollapsed && sessions.length > 0 && (
                            <div className="py-1 space-y-1">
                                {sessions.map((session) => (
                                    <button
                                        key={session.id}
                                        className={cn(
                                            'w-full flex justify-center p-2 rounded-lg cursor-pointer transition-all',
                                            currentSessionId === session.id ? 'bg-white/10' : 'hover:bg-white/5'
                                        )}
                                        onClick={() => onSelectSession(session.id)}
                                        title={session.title}
                                    >
                                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Bottom: user menu */}
                    <div className="p-2 mt-auto">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className={cn(
                                        'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left',
                                        isCollapsed && 'justify-center px-0'
                                    )}
                                >
                                    <Avatar className="h-7 w-7 border border-border/40 shrink-0">
                                        <AvatarFallback className="bg-[#4a4a4a] text-white text-xs font-medium">
                                            {initial}
                                        </AvatarFallback>
                                    </Avatar>
                                    {!isCollapsed && (
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate text-foreground leading-none">{displayName}</p>
                                        </div>
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52 bg-[#2a2a2a] border-border/40" sideOffset={8}>
                                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border/40 mb-1">
                                    {user?.email}
                                </div>
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        setIsSettingsOpen(true);
                                    }}
                                    className="cursor-pointer text-sm mb-1"
                                >
                                    <Settings className="mr-2 h-4 w-4" />
                                    Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => signOut()}
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-sm"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Drag handle — sibling to the content div, straddling the border */}
                {!isCollapsed && (
                    <div
                        onMouseDown={startDrag}
                        className={cn(
                            'absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-40',
                            'translate-x-1/2',
                            isDragging ? 'bg-blue-500/50' : 'hover:bg-blue-500/30'
                        )}
                        title="Drag to resize"
                    />
                )}
            </div>

            <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        </>
    );
}
