'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChatSession } from '@/types/chat';
import { formatRelativeTime } from '@/utils/date-helpers';
import {
    Archive,
    MessageSquare,
    Loader2,
    Inbox,
    Trash2,
    RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionLabel, SettingsCard } from '../primitives';

const supabase = createClient();

interface ArchivedChatsTabProps {
    onOpenChat: (sessionId: string) => void;
}

export function ArchivedChatsTab({ onOpenChat }: ArchivedChatsTabProps) {
    const { user } = useAuth();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const loadArchivedSessions = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_archived', true)
                .order('updated_at', { ascending: false });

            if (!error && data) {
                setSessions(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (data as any[]).map((s) => ({
                        id: s.id,
                        userId: s.user_id,
                        title: s.title,
                        createdAt: new Date(s.created_at),
                        updatedAt: new Date(s.updated_at),
                        isPinned: s.is_pinned ?? false,
                        isArchived: true,
                        projectId: s.project_id ?? null,
                        branchedFromSessionId: s.branched_from_session_id ?? null,
                        branchedFromTitle: s.branched_from_title ?? null,
                    }))
                );
            }
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadArchivedSessions();
    }, [loadArchivedSessions]);

    const handleUnarchive = useCallback(
        async (sessionId: string, e: React.MouseEvent) => {
            e.stopPropagation();
            setActionLoadingId(sessionId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('chat_sessions')
                .update({ is_archived: false })
                .eq('id', sessionId);
            setSessions((prev) => prev.filter((s) => s.id !== sessionId));
            setActionLoadingId(null);
        },
        []
    );

    const handleDelete = useCallback(
        async (sessionId: string, e: React.MouseEvent) => {
            e.stopPropagation();
            setActionLoadingId(sessionId);
            await supabase.from('chat_sessions').delete().eq('id', sessionId);
            setSessions((prev) => prev.filter((s) => s.id !== sessionId));
            setActionLoadingId(null);
        },
        []
    );

    if (isLoading) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 h-56 text-center">
                <div className="h-10 w-10 rounded-md bg-surface-2 border border-border flex items-center justify-center">
                    <Inbox
                        className="h-5 w-5 text-foreground-subtle"
                        strokeWidth={1.5}
                    />
                </div>
                <div>
                    <p className="text-[13px] font-medium text-foreground">
                        No archived chats
                    </p>
                    <p className="text-[12px] text-foreground-muted mt-0.5">
                        Chats you archive will appear here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-1 animate-in fade-in slide-in-from-bottom-1 duration-200 pb-4">
            <SectionLabel>
                {sessions.length} archived {sessions.length === 1 ? 'chat' : 'chats'}
            </SectionLabel>
            <SettingsCard>
                {sessions.map((session) => {
                    const isActioning = actionLoadingId === session.id;
                    return (
                        <div
                            key={session.id}
                            onClick={() => !isActioning && onOpenChat(session.id)}
                            className={cn(
                                'group flex items-center gap-3 px-3 py-2.5 transition-colors',
                                isActioning
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'cursor-pointer hover:bg-surface-2'
                            )}
                        >
                            <div className="h-8 w-8 rounded-md bg-surface-2 border border-border flex items-center justify-center shrink-0">
                                <Archive
                                    className="h-3.5 w-3.5 text-foreground-subtle"
                                    strokeWidth={1.5}
                                />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-foreground truncate leading-none">
                                    {session.title}
                                </p>
                                <p className="text-[11px] text-foreground-subtle mt-1 font-mono tabular-nums">
                                    {formatRelativeTime(session.updatedAt)}
                                </p>
                            </div>

                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                <IconButton
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenChat(session.id);
                                    }}
                                    disabled={isActioning}
                                    label="Open chat"
                                >
                                    <MessageSquare
                                        className="h-3.5 w-3.5"
                                        strokeWidth={1.5}
                                    />
                                </IconButton>
                                <IconButton
                                    onClick={(e) => handleUnarchive(session.id, e)}
                                    disabled={isActioning}
                                    label="Restore"
                                >
                                    {isActioning ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <RotateCcw
                                            className="h-3.5 w-3.5"
                                            strokeWidth={1.5}
                                        />
                                    )}
                                </IconButton>
                                <IconButton
                                    onClick={(e) => handleDelete(session.id, e)}
                                    disabled={isActioning}
                                    label="Delete permanently"
                                    danger
                                >
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </IconButton>
                            </div>
                        </div>
                    );
                })}
            </SettingsCard>
        </div>
    );
}

function IconButton({
    onClick,
    disabled,
    label,
    children,
    danger,
}: {
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    label: string;
    children: React.ReactNode;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={cn(
                'h-7 w-7 flex items-center justify-center rounded-md transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                danger
                    ? 'text-foreground-muted hover:text-destructive hover:bg-destructive/10'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-3'
            )}
        >
            {children}
        </button>
    );
}
