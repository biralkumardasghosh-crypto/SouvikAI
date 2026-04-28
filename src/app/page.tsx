'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar, ModelSelector, ChatContainer, ChatInput, SearchModal, ConfirmModal, QuotaBanner } from '@/components/chat';
import { ChatAccentProvider } from '@/components/chat/ChatAccentProvider';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useQuota } from '@/hooks/useQuota';
import { Loader2, Menu, UserCircle, Bell, Archive } from 'lucide-react';
import { Button, SimpleTooltip } from '@/components/ui';

interface PendingAction {
    type: 'delete' | 'archive';
    sessionId: string;
}

export default function ChatPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
                </div>
            }
        >
            <ChatPageInner />
        </Suspense>
    );
}

function ChatPageInner() {
    const { isLoading: authLoading, isAuthenticated } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [pendingMessage, setPendingMessage] = useState('');
    const consumedSessionParamRef = useRef<string | null>(null);
    const consumedProjectParamRef = useRef<string | null>(null);

    const {
        messages,
        isLoading,
        error,
        currentSessionId,
        sessions,
        models,
        sendMessage,
        regenerateMessage,
        newChat,
        selectSession,
        deleteSession,
        pinSession,
        archiveSession,
        renameSession,
        abortRequest,
        selectedModelId,
        setSelectedModelId,
        isCurrentSessionArchived,
    } = useChat();

    // ── Open chat from `?session=<id>` query param (used by /chats page) ──
    useEffect(() => {
        const sessionParam = searchParams.get('session');
        if (
            sessionParam &&
            isAuthenticated &&
            consumedSessionParamRef.current !== sessionParam
        ) {
            consumedSessionParamRef.current = sessionParam;
            selectSession(sessionParam);
            // Strip the query param so a refresh doesn't re-trigger selection.
            router.replace('/');
        }
    }, [searchParams, isAuthenticated, selectSession, router]);

    // ── Start a project-bound new chat from `?project=<id>` (used by the
    //    "New chat" button on the project page). The next session created via
    //    `sendMessage` will be assigned to this project; the URL is then
    //    cleared so subsequent new chats default back to no project. ────────
    useEffect(() => {
        const projectParam = searchParams.get('project');
        if (
            projectParam &&
            isAuthenticated &&
            consumedProjectParamRef.current !== projectParam
        ) {
            consumedProjectParamRef.current = projectParam;
            newChat(projectParam);
            router.replace('/');
        }
    }, [searchParams, isAuthenticated, newChat, router]);

    // ── QUOTA CHECKING ──────────────────────────────────────────────────────────
    const quota = useQuota(selectedModelId, models);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push('/signin');
        }
    }, [authLoading, isAuthenticated, router]);

    // Global Ctrl+K shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleDeleteRequest = useCallback((sessionId: string) => {
        setPendingAction({ type: 'delete', sessionId });
    }, []);

    const handleArchiveRequest = useCallback((sessionId: string) => {
        setPendingAction({ type: 'archive', sessionId });
    }, []);

    const handleConfirm = useCallback(() => {
        if (!pendingAction) return;
        if (pendingAction.type === 'delete') {
            deleteSession(pendingAction.sessionId);
        } else {
            archiveSession(pendingAction.sessionId);
        }
        setPendingAction(null);
    }, [pendingAction, deleteSession, archiveSession]);

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    const isDeletePending = pendingAction?.type === 'delete';

    return (
        <ChatAccentProvider>
            {/* Sidebar */}
            <Sidebar
                sessions={sessions}
                currentSessionId={currentSessionId}
                onNewChat={newChat}
                onSearch={() => setIsSearchOpen(true)}
                onSelectSession={(sessionId) => {
                    selectSession(sessionId);
                    setIsSidebarOpen(false);
                }}
                onDeleteSession={handleDeleteRequest}
                onPinSession={pinSession}
                onArchiveSession={handleArchiveRequest}
                onRenameSession={renameSession}
                onOpenArchivedChat={(sessionId) => {
                    // Load the archived session's messages in the main chat view
                    selectSession(sessionId);
                }}
                isMobileOpen={isSidebarOpen}
                onMobileClose={() => setIsSidebarOpen(false)}
            />

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
                {/* Header */}
                <header className="flex items-center justify-between px-2 md:px-3 py-2 bg-background border-b border-border-subtle sticky top-0 z-20">
                    <div className="flex items-center gap-1">
                        <SimpleTooltip content="Open menu" side="bottom">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="md:hidden h-9 w-9 text-foreground-muted hover:text-foreground hover:bg-surface-2"
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="Open menu"
                            >
                                <Menu className="h-5 w-5" />
                            </Button>
                        </SimpleTooltip>
                        <SimpleTooltip content="Switch model" side="bottom">
                            <div>
                                <ModelSelector models={models} value={selectedModelId} onValueChange={setSelectedModelId} />
                            </div>
                        </SimpleTooltip>
                    </div>

                    <div className="flex items-center gap-1">
                        <SimpleTooltip content="Account" side="bottom">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-foreground-muted hover:text-foreground hover:bg-surface-2"
                                aria-label="Account"
                            >
                                <UserCircle className="h-5 w-5" />
                            </Button>
                        </SimpleTooltip>
                        <SimpleTooltip content="Notifications" side="bottom">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-foreground-muted hover:text-foreground hover:bg-surface-2"
                                aria-label="Notifications"
                            >
                                <Bell className="h-5 w-5" />
                            </Button>
                        </SimpleTooltip>
                    </div>
                </header>

                {/* Archived chat banner */}
                {isCurrentSessionArchived && (
                    <div className="flex items-center gap-2.5 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs font-medium">
                        <Archive className="h-3.5 w-3.5 shrink-0" />
                        This chat is archived. It is read-only — you cannot send new messages.
                    </div>
                )}

                {/* Chat Container */}
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    <ChatContainer
                        messages={messages}
                        isLoading={isLoading}
                        error={error}
                        onSend={(msg, attachments, tool) => sendMessage(msg, attachments, tool)}
                        onStop={abortRequest}
                        onRegenerate={regenerateMessage}
                        onSuggestionSelect={(prompt) => setPendingMessage(prompt)}
                        pendingMessage={pendingMessage}
                        onPendingMessageConsumed={() => setPendingMessage('')}
                    />
                </div>

                {/* Bottom input — only shown during active (non-archived) conversations */}
                {messages.length > 0 && !isCurrentSessionArchived && (
                    <div className="relative z-20 safe-bottom">
                        {quota.isNearLimit && (
                            <QuotaBanner
                                pct={quota.pct}
                                used={quota.used}
                                limit={quota.limit}
                            />
                        )}
                        <ChatInput
                            onSend={(msg, attachments, tool) => sendMessage(msg, attachments, tool)}
                            onStop={abortRequest}
                            isLoading={isLoading}
                        />
                    </div>
                )}
            </div>

            {/* Search Modal */}
            <SearchModal
                open={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                sessions={sessions}
                onSelectSession={selectSession}
            />

            {/* Delete / Archive Confirmation Modal */}
            <ConfirmModal
                open={pendingAction !== null}
                onClose={() => setPendingAction(null)}
                onConfirm={handleConfirm}
                title={isDeletePending ? 'Delete chat?' : 'Archive chat?'}
                description={
                    isDeletePending
                        ? 'This chat and all its messages will be permanently deleted. This action cannot be undone.'
                        : 'This chat will be archived and will no longer appear in your chat list. You can access archived chats later.'
                }
                confirmLabel={isDeletePending ? 'Delete' : 'Archive'}
                confirmVariant={isDeletePending ? 'danger' : 'warning'}
            />
        </ChatAccentProvider>
    );
}
