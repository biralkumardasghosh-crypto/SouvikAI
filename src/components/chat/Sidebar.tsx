'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    Plus,
    MessageSquare,
    Trash2,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    X,
    Search,
    Image as ImageIcon,
    Grid2X2,
    Code2,
    MoreHorizontal,
    Pin,
    Archive,
    Settings,
} from 'lucide-react';
import {
    Button,
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
import { SettingsModal } from '@/components/chat/settings/SettingsModal';

interface SidebarProps {
    sessions: ChatSession[];
    currentSessionId: string | null;
    onNewChat: () => void;
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
    onPinSession: (sessionId: string) => void;
    onArchiveSession: (sessionId: string) => void;
    onSearch: () => void;
    /** Called when an archived chat is selected from Settings — loads it in the main view. */
    onOpenArchivedChat?: (sessionId: string) => void;
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

const NAV_ITEMS = [
    { icon: Plus, label: 'New chat', action: 'new-chat' as const },
    { icon: Search, label: 'Search chats', action: 'search' as const, shortcut: '⌘K' },
    { icon: ImageIcon, label: 'Images', action: 'images' as const },
    { icon: Grid2X2, label: 'Apps', action: 'apps' as const },
    { icon: Code2, label: 'Codex', action: 'codex' as const },
];

// ── Group chats by recency ──────────────────────────────────────────────────
type ChatGroup = { label: string; sessions: ChatSession[] };

function groupSessions(sessions: ChatSession[]): ChatGroup[] {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const pinned: ChatSession[] = [];
    const today: ChatSession[] = [];
    const week: ChatSession[] = [];
    const older: ChatSession[] = [];

    for (const s of sessions) {
        if (s.isPinned) {
            pinned.push(s);
            continue;
        }
        const t = new Date(s.updatedAt).getTime();
        const diff = now - t;
        if (diff < DAY) today.push(s);
        else if (diff < 7 * DAY) week.push(s);
        else older.push(s);
    }

    const groups: ChatGroup[] = [];
    if (pinned.length) groups.push({ label: 'Pinned', sessions: pinned });
    if (today.length) groups.push({ label: 'Today', sessions: today });
    if (week.length) groups.push({ label: 'Previous 7 days', sessions: week });
    if (older.length) groups.push({ label: 'Older', sessions: older });
    return groups;
}

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
                    'group relative flex items-center gap-1.5 pl-2 pr-1 h-8 rounded-md cursor-pointer transition-colors duration-150 text-[13px]',
                    isActive
                        ? 'bg-white/10 text-foreground'
                        : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
                )}
                onClick={onSelect}
            >
                <span className="flex-1 min-w-0 truncate leading-none">{session.title}</span>

                <button
                    ref={btnRef}
                    onClick={openMenu}
                    className={cn(
                        'shrink-0 h-6 w-6 flex items-center justify-center rounded transition-all',
                        menuOpen
                            ? 'bg-white/15 text-foreground opacity-100'
                            : 'text-muted-foreground/70 hover:bg-white/10 hover:text-foreground opacity-0 group-hover:opacity-100',
                        isActive && 'opacity-100'
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
                    className="min-w-[160px] bg-[#2a2a2a] rounded-lg border border-white/10 shadow-2xl py-1"
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); onPin(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                        <Pin className="h-3.5 w-3.5 rotate-45" />
                        {session.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onArchive(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                    </button>
                    <div className="my-1 h-px bg-white/10" />
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </button>
                </div>
            )}
        </>
    );
}

// ── Brand mark ──────────────────────────────────────────────────────────────
function BrandMark({ withWordmark = true }: { withWordmark?: boolean }) {
    return (
        <div className="flex items-center gap-2 text-foreground">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-white/20 to-white/5 border border-white/10 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.477 2 2 6.27 2 11.5c0 2.37.93 4.53 2.46 6.14L3 21.75l4.45-1.45A10.1 10.1 0 0 0 12 21c5.523 0 10-4.27 10-9.5S17.523 2 12 2Z" fill="currentColor" />
                </svg>
            </div>
            {withWordmark && (
                <span className="text-[14px] font-semibold tracking-tight">SouvikAI</span>
            )}
        </div>
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
    onOpenArchivedChat,
    isMobileOpen = false,
    onMobileClose,
}: SidebarProps) {
    const { user, signOut } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(244);
    const [isDragging, setIsDragging] = useState(false);
    const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
    const initial = displayName.charAt(0).toUpperCase();

    const MIN_WIDTH = 200;
    const MAX_WIDTH = 420;
    const COLLAPSED_WIDTH = 56;

    const groups = useMemo(() => groupSessions(sessions), [sessions]);

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
                <div className="sidebar-drawer md:hidden w-[256px] bg-[#171717] flex flex-col h-full safe-top safe-bottom">
                    <div className="flex items-center justify-between px-3 h-12 border-b border-white/[0.06]">
                        <BrandMark />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMobileClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <nav className="px-2 py-2 space-y-0.5">
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.action}
                                    onClick={item.action === 'new-chat' ? onNewChat : item.action === 'search' ? onSearch : undefined}
                                    className="w-full flex items-center gap-2.5 px-2 h-9 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="flex-1 text-left">{item.label}</span>
                                    {item.shortcut && (
                                        <kbd className="text-[10px] font-mono text-muted-foreground/50 bg-white/5 border border-white/10 rounded px-1 py-0.5">
                                            {item.shortcut}
                                        </kbd>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="h-px bg-white/[0.06] mx-2" />

                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2">
                        {groups.map((group) => (
                            <div key={group.label} className="mb-3 last:mb-0">
                                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                    {group.label}
                                </div>
                                <div className="space-y-0.5">
                                    {group.sessions.map((session) => (
                                        <div
                                            key={session.id}
                                            className={cn(
                                                'flex items-center gap-2 px-2 h-9 rounded-md cursor-pointer transition-colors text-[13px]',
                                                currentSessionId === session.id
                                                    ? 'bg-white/10 text-foreground'
                                                    : 'hover:bg-white/[0.06] text-muted-foreground hover:text-foreground'
                                            )}
                                            onClick={() => onSelectSession(session.id)}
                                        >
                                            {session.isPinned ? (
                                                <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60 rotate-45" />
                                            ) : (
                                                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                                            )}
                                            <span className="flex-1 truncate">{session.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="h-px bg-white/[0.06] mx-2" />

                    <div className="p-2">
                        <UserMenu
                            user={user}
                            displayName={displayName}
                            initial={initial}
                            collapsed={false}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            onSignOut={() => signOut()}
                        />
                    </div>
                </div>
            )}

            {/* ── Desktop sidebar ── */}
            <div
                className="hidden md:block md:relative md:flex-shrink-0 h-full transition-[width] duration-200 ease-out"
                style={{ width: isCollapsed ? COLLAPSED_WIDTH : sidebarWidth }}
            >
                <div className="flex flex-col w-full h-full bg-[#171717] border-r border-white/[0.06] overflow-hidden">

                    {/* ── Header: brand + collapse toggle ── */}
                    <div
                        className={cn(
                            'flex items-center h-12 px-2 shrink-0',
                            isCollapsed ? 'flex-col gap-1.5 h-auto py-2' : 'justify-between'
                        )}
                    >
                        <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'pl-1')}>
                            <BrandMark withWordmark={!isCollapsed} />
                        </div>
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="text-muted-foreground hover:text-foreground transition-colors h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/[0.06]"
                            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                    </div>

                    {/* ── Primary nav ── */}
                    <nav className={cn('px-2 space-y-0.5', isCollapsed && 'px-1.5')}>
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const isNewChat = item.action === 'new-chat';
                            const isSearch = item.action === 'search';
                            const handler = isNewChat ? onNewChat : isSearch ? onSearch : undefined;

                            return (
                                <button
                                    key={item.action}
                                    onClick={handler}
                                    className={cn(
                                        'w-full flex items-center text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors duration-150 rounded-md',
                                        isCollapsed
                                            ? 'h-8 w-8 mx-auto justify-center'
                                            : 'gap-2.5 px-2 h-8'
                                    )}
                                    title={isCollapsed ? item.label : undefined}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    {!isCollapsed && (
                                        <>
                                            <span className="flex-1 text-left">{item.label}</span>
                                            {isSearch && (
                                                <kbd className="text-[10px] font-mono text-muted-foreground/50 bg-white/5 border border-white/10 rounded px-1 py-px">
                                                    ⌘K
                                                </kbd>
                                            )}
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* ── Chats section ── */}
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mt-2">
                        {!isCollapsed && groups.length > 0 && (
                            <div className="px-2 pb-2">
                                {groups.map((group) => (
                                    <div key={group.label} className="mb-3 last:mb-1">
                                        <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                            {group.label}
                                        </div>
                                        <div className="space-y-px">
                                            {group.sessions.map((session) => (
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
                                    </div>
                                ))}
                            </div>
                        )}

                        {!isCollapsed && groups.length === 0 && (
                            <div className="px-4 py-6 text-center">
                                <p className="text-[12px] text-muted-foreground/60">No chats yet</p>
                                <p className="text-[11px] text-muted-foreground/40 mt-0.5">Start a new chat to begin</p>
                            </div>
                        )}

                        {isCollapsed && sessions.length > 0 && (
                            <div className="px-1.5 py-1 space-y-1">
                                {sessions.slice(0, 12).map((session) => (
                                    <button
                                        key={session.id}
                                        className={cn(
                                            'w-8 h-8 mx-auto flex items-center justify-center rounded-md cursor-pointer transition-colors',
                                            currentSessionId === session.id
                                                ? 'bg-white/10 text-foreground'
                                                : 'hover:bg-white/[0.06] text-muted-foreground hover:text-foreground'
                                        )}
                                        onClick={() => onSelectSession(session.id)}
                                        title={session.title}
                                    >
                                        {session.isPinned ? (
                                            <Pin className="h-3.5 w-3.5 rotate-45" />
                                        ) : (
                                            <MessageSquare className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Footer: user menu ── */}
                    <div className={cn('shrink-0 border-t border-white/[0.06]', isCollapsed ? 'p-1.5' : 'p-2')}>
                        <UserMenu
                            user={user}
                            displayName={displayName}
                            initial={initial}
                            collapsed={isCollapsed}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            onSignOut={() => signOut()}
                        />
                    </div>
                </div>

                {/* Drag handle */}
                {!isCollapsed && (
                    <div
                        onMouseDown={startDrag}
                        className={cn(
                            'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-40 transition-colors',
                            isDragging ? 'bg-blue-500/60' : 'hover:bg-blue-500/30'
                        )}
                        title="Drag to resize"
                    />
                )}
            </div>

            <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} onOpenArchivedChat={onOpenArchivedChat} />
        </>
    );
}

// ── User menu (footer) ──────────────────────────────────────────────────────
interface UserMenuProps {
    user: { email?: string; displayName?: string } | null;
    displayName: string;
    initial: string;
    collapsed: boolean;
    onOpenSettings: () => void;
    onSignOut: () => void;
}

function UserMenu({ user, displayName, initial, collapsed, onOpenSettings, onSignOut }: UserMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className={cn(
                        'w-full flex items-center rounded-md hover:bg-white/[0.06] transition-colors text-left',
                        collapsed ? 'h-8 w-8 mx-auto justify-center p-0' : 'gap-2 px-1.5 py-1.5'
                    )}
                    title={collapsed ? displayName : undefined}
                >
                    <Avatar className="h-7 w-7 shrink-0 ring-1 ring-white/10">
                        <AvatarFallback className="bg-gradient-to-br from-[#5a5a5a] to-[#3a3a3a] text-white text-[11px] font-semibold">
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate text-foreground leading-tight">{displayName}</p>
                            <p className="text-[11px] text-muted-foreground truncate leading-tight">Free plan</p>
                        </div>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-[#2a2a2a] border-white/10" sideOffset={8}>
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground border-b border-white/10 mb-1 truncate">
                    {user?.email}
                </div>
                <DropdownMenuItem
                    onSelect={(e) => {
                        e.preventDefault();
                        onOpenSettings();
                    }}
                    className="cursor-pointer text-[13px]"
                >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={onSignOut}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-[13px]"
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
