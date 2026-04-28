'use client';

import { useEffect, useRef, useState } from 'react';
import {
    Pin,
    Archive,
    ArchiveRestore,
    Trash2,
    Pencil,
    MoreHorizontal,
    Check,
    X,
    GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date-helpers';
import type { ChatSession } from '@/types/chat';
import { ProjectBadge } from './ProjectBadge';
import { MenuItem } from './MenuItem';
import type { UserMeta } from './types';

/**
 * A single row in the chat list. Owns its own action-menu open state and
 * focuses the rename input when it transitions into rename mode. All
 * mutations are delegated upward via the on… callbacks.
 */
interface ChatRowProps {
    session: ChatSession;
    user: UserMeta | null;
    isRenaming: boolean;
    renameValue: string;
    onRenameValueChange: (v: string) => void;
    onRenameStart: () => void;
    onRenameSave: () => void;
    onRenameCancel: () => void;
    onOpen: () => void;
    onTogglePin: () => void;
    onToggleArchive: () => void;
    onDelete: () => void;
    onBranch?: () => void;
    showProjectColumn: boolean;
}

export function ChatRow({
    session,
    user,
    isRenaming,
    renameValue,
    onRenameValueChange,
    onRenameStart,
    onRenameSave,
    onRenameCancel,
    onOpen,
    onTogglePin,
    onToggleArchive,
    onDelete,
    onBranch,
    showProjectColumn,
}: ChatRowProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [isRenaming]);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node))
                setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onRenameSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onRenameCancel();
        }
    };

    const initial = (
        user?.user_metadata?.full_name?.[0] ||
        user?.email?.[0] ||
        'U'
    ).toUpperCase();

    const projectLabel = session.isArchived ? 'Archived' : 'Personal';

    return (
        <li className="group">
            <div
                className={cn(
                    'grid items-center gap-3 md:gap-4 px-3 py-3 hover:bg-surface-2 transition-colors',
                    'grid-cols-[minmax(0,1fr)_auto]',
                    showProjectColumn
                        ? 'md:grid-cols-[minmax(0,1fr)_220px_180px]'
                        : 'md:grid-cols-[minmax(0,1fr)_180px]'
                )}
            >
                {/* Name */}
                <div className="min-w-0">
                    {isRenaming ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                ref={inputRef}
                                value={renameValue}
                                onChange={(e) => onRenameValueChange(e.target.value)}
                                onKeyDown={handleKey}
                                maxLength={120}
                                className="flex-1 min-w-0 h-8 px-2 rounded-md bg-surface border border-border-strong text-[14px] text-foreground outline-none focus:border-ring focus:shadow-[0_0_0_1px_hsl(var(--ring))]"
                            />
                            <button
                                onClick={onRenameSave}
                                className="h-7 w-7 flex items-center justify-center rounded-md bg-foreground text-background transition-colors"
                                aria-label="Save"
                            >
                                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                            <button
                                onClick={onRenameCancel}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-3 transition-colors"
                                aria-label="Cancel"
                            >
                                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={onOpen} className="block w-full text-left">
                            <span className="inline-flex items-center gap-1.5 max-w-full">
                                <span className="text-[14px] text-foreground truncate">
                                    {session.title}
                                </span>
                                {session.isPinned && (
                                    <Pin
                                        className="h-3 w-3 shrink-0 fill-foreground text-foreground"
                                        aria-label="Pinned"
                                        strokeWidth={1.5}
                                    />
                                )}
                            </span>
                            <p className="md:hidden text-[12px] text-foreground-muted mt-0.5 flex items-center gap-2">
                                {showProjectColumn && (
                                    <>
                                        <ProjectBadge
                                            label={projectLabel}
                                            archived={session.isArchived}
                                        />
                                        <span aria-hidden>·</span>
                                    </>
                                )}
                                <span className="font-mono tabular-nums">
                                    {formatRelativeTime(session.updatedAt)}
                                </span>
                            </p>
                        </button>
                    )}
                </div>

                {/* Project (desktop) */}
                {showProjectColumn && (
                    <div className="hidden md:flex items-center min-w-0">
                        <ProjectBadge label={projectLabel} archived={session.isArchived} />
                    </div>
                )}

                {/* Updated + avatar + menu */}
                <div className="flex items-center justify-end gap-2 md:gap-3">
                    <span className="hidden md:inline font-mono text-[12px] text-foreground-muted tabular-nums whitespace-nowrap">
                        {formatRelativeTime(session.updatedAt)}
                    </span>
                    <div
                        className="hidden md:flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 border border-border text-[10px] font-semibold text-foreground"
                        aria-hidden="true"
                    >
                        {initial}
                    </div>

                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((o) => !o);
                            }}
                            className={cn(
                                'h-7 w-7 flex items-center justify-center rounded-md transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                menuOpen
                                    ? 'bg-surface-3 text-foreground opacity-100'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-3 md:opacity-0 md:group-hover:opacity-100'
                            )}
                            aria-label="More actions"
                        >
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-full mt-1 min-w-[180px] z-30 bg-popover border border-border rounded-md shadow-overlay py-1 overflow-hidden">
                                <MenuItem
                                    onClick={() => {
                                        onTogglePin();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Pin className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                    label={session.isPinned ? 'Unpin' : 'Pin'}
                                />
                                <MenuItem
                                    onClick={() => {
                                        onRenameStart();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                    label="Rename"
                                />
                                {onBranch && (
                                    <MenuItem
                                        onClick={() => {
                                            onBranch();
                                            setMenuOpen(false);
                                        }}
                                        icon={<GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                        label="Branch"
                                    />
                                )}
                                <MenuItem
                                    onClick={() => {
                                        onToggleArchive();
                                        setMenuOpen(false);
                                    }}
                                    icon={
                                        session.isArchived ? (
                                            <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.5} />
                                        ) : (
                                            <Archive className="h-3.5 w-3.5" strokeWidth={1.5} />
                                        )
                                    }
                                    label={session.isArchived ? 'Unarchive' : 'Archive'}
                                />
                                <div className="my-1 h-px bg-border-subtle" />
                                <MenuItem
                                    onClick={() => {
                                        onDelete();
                                        setMenuOpen(false);
                                    }}
                                    icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                                    label="Delete"
                                    danger
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
}
