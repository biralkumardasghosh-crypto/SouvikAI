'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChatSession } from '@/types/chat';
import { formatRelativeTime } from '@/utils/date-helpers';
import { Archive, MessageSquare, Loader2, Inbox, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const supabase = createClient();

interface ArchivedChatsTabProps {
    /** Called when the user clicks an archived chat — closes settings and opens it. */
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

    const handleUnarchive = useCallback(async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActionLoadingId(sessionId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('chat_sessions')
            .update({ is_archived: false })
            .eq('id', sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setActionLoadingId(null);
    }, []);

    const handleDelete = useCallback(async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActionLoadingId(sessionId);
        await supabase.from('chat_sessions').delete().eq('id', sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setActionLoadingId(null);
    }, []);

    if (isLoading) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 h-48 text-center">
                <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center">
                    <Inbox className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <div>
                    <p className="text-sm font-medium text-foreground/70">No archived chats</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Chats you archive will appear here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-0.5 pb-1.5">
                {sessions.length} archived {sessions.length === 1 ? 'chat' : 'chats'}
            </p>
            <div className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden divide-y divide-border/30">
                {sessions.map((session) => {
                    const isActioning = actionLoadingId === session.id;
                    return (
                        <div
                            key={session.id}
                            onClick={() => !isActioning && onOpenChat(session.id)}
                            className={cn(
                                'group flex items-center gap-2.5 px-3 py-2 transition-colors',
                                isActioning
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'cursor-pointer hover:bg-white/5'
                            )}
                        >
                            {/* Icon */}
                            <div className="h-7 w-7 rounded-md bg-muted/30 border border-border/40 flex items-center justify-center shrink-0">
                                <Archive className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </div>

                            {/* Title + date */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-foreground/90 truncate leading-none">
                                    {session.title}
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    {formatRelativeTime(session.updatedAt)}
                                </p>
                            </div>

                            {/* Action buttons — visible on hover */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {/* Open chat */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onOpenChat(session.id); }}
                                    disabled={isActioning}
                                    title="Open chat"
                                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                                >
                                    <MessageSquare className="h-3 w-3" />
                                </button>

                                {/* Unarchive */}
                                <button
                                    onClick={(e) => handleUnarchive(session.id, e)}
                                    disabled={isActioning}
                                    title="Unarchive"
                                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                                >
                                    {isActioning
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <RotateCcw className="h-3 w-3" />
                                    }
                                </button>

                                {/* Delete permanently */}
                                <button
                                    onClick={(e) => handleDelete(session.id, e)}
                                    disabled={isActioning}
                                    title="Delete permanently"
                                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-[10px] text-muted-foreground/50 px-1 pt-1">
                Click a chat to open it. Use <span className="font-medium text-muted-foreground/70">↩</span> to restore it to your chat list.
            </p>
        </div>
    );
}
