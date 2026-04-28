'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, SimpleTooltip } from '@/components/ui';
import { BuilderChatPanel } from './BuilderChatPanel';
import { CodeEditor } from './CodeEditor';
import { CodePreview } from './CodePreview';
import { DiffPanel } from './DiffPanel';
import { FileTree } from './FileTree';
import { ViewToggle, type WorkspaceView } from './ViewToggle';
import type { BuilderFiles, BuilderMessage } from '@/types/code';
import type { AIModel } from '@/types/chat';

interface CodeWorkspaceProps {
    title: string;
    files: BuilderFiles;
    activeFile: string | null;
    messages: BuilderMessage[];
    isStreaming: boolean;
    error: string | null;
    models: AIModel[];
    selectedModelId: string;
    onModelChange: (id: string) => void;
    onSelectFile: (path: string) => void;
    onUpdateFile: (path: string, content: string) => void;
    onSend: (text: string) => void;
    onStop: () => void;
    onAcceptChanges: (messageId: string, paths?: string[] | null) => Promise<void>;
    onRejectChanges: (messageId: string, paths?: string[] | null) => Promise<void>;
}

const CHAT_WIDTH_STORAGE_KEY = 'forge:chatPanelWidth';
const CHAT_WIDTH_DEFAULT = 380;
const CHAT_WIDTH_MIN = 280;
const CHAT_WIDTH_MAX_FALLBACK = 720;

function clampWidth(width: number, viewport: number): number {
    // Always leave at least 360px for the right pane on desktop.
    const upper = Math.max(
        CHAT_WIDTH_MIN,
        Math.min(CHAT_WIDTH_MAX_FALLBACK, viewport - 360),
    );
    return Math.max(CHAT_WIDTH_MIN, Math.min(upper, width));
}

/**
 * Two-column Builder layout:
 *
 *   [ chat panel  ] | [ editor ⇄ preview ]
 *      resizable        flex-1
 *
 * The right pane swaps between the file editor and the live preview via
 * {@link ViewToggle}. On desktop the divider between the two panes can be
 * dragged to resize them; the chosen width is persisted in localStorage. On
 * mobile the layout collapses to a single column with a tab bar at the top
 * to switch between chat / editor / preview, and the resize handle is
 * hidden.
 */
export function CodeWorkspace(props: CodeWorkspaceProps) {
    const [view, setView] = useState<WorkspaceView>('editor');
    const [mobileTab, setMobileTab] = useState<'chat' | 'right'>('chat');

    // Total pending changes across all assistant messages — drives the
    // "Review" tab badge.
    const pendingReviewCount = useMemo(() => {
        let n = 0;
        for (const m of props.messages) {
            n += m.review?.pending.length ?? 0;
        }
        return n;
    }, [props.messages]);

    // If the Review tab is open and the queue empties, fall back to
    // the editor so the user isn't stranded on an empty surface.
    useEffect(() => {
        if (view === 'review' && pendingReviewCount === 0) {
            setView('editor');
        }
    }, [view, pendingReviewCount]);

    /**
     * Called by the chat panel when the user clicks "Review" on an
     * assistant message banner. Switches the right pane to the diff
     * view (and on mobile flips to the right tab so it's visible).
     */
    const handleOpenReview = useCallback(() => {
        setView('review');
        setMobileTab('right');
    }, []);

    // ── Resizable left pane ────────────────────────────────────────────────
    const [isDesktop, setIsDesktop] = useState(false);
    const [chatWidth, setChatWidth] = useState<number>(CHAT_WIDTH_DEFAULT);
    const [isDragging, setIsDragging] = useState(false);

    const dragRef = useRef<{
        startX: number;
        startWidth: number;
        active: boolean;
    }>({ startX: 0, startWidth: CHAT_WIDTH_DEFAULT, active: false });

    // Mirror chatWidth into a ref so the global drag listeners can read the
    // latest value without re-binding on every change.
    const chatWidthRef = useRef(chatWidth);
    useEffect(() => {
        chatWidthRef.current = chatWidth;
    }, [chatWidth]);

    // Track desktop breakpoint (md+) so we only apply inline width / show the
    // handle on desktop.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 768px)');
        const update = () => setIsDesktop(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    // Hydrate persisted width and reclamp on viewport resize.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        let initial = CHAT_WIDTH_DEFAULT;
        try {
            const stored = window.localStorage.getItem(CHAT_WIDTH_STORAGE_KEY);
            const parsed = stored ? Number.parseInt(stored, 10) : NaN;
            if (Number.isFinite(parsed)) initial = parsed;
        } catch {
            /* ignore — localStorage may be unavailable */
        }
        setChatWidth((prev) => clampWidth(initial || prev, window.innerWidth));

        const onResize = () => {
            setChatWidth((prev) => clampWidth(prev, window.innerWidth));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Global mouse / touch listeners for the drag.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const onMove = (clientX: number) => {
            const drag = dragRef.current;
            if (!drag.active) return;
            const delta = clientX - drag.startX;
            setChatWidth(
                clampWidth(drag.startWidth + delta, window.innerWidth),
            );
        };

        const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 0) return;
            onMove(e.touches[0].clientX);
            // Prevent the page from scrolling while dragging on touch devices.
            if (dragRef.current.active && e.cancelable) e.preventDefault();
        };

        const stop = () => {
            const drag = dragRef.current;
            if (!drag.active) return;
            drag.active = false;
            setIsDragging(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Persist the latest width.
            try {
                window.localStorage.setItem(
                    CHAT_WIDTH_STORAGE_KEY,
                    String(Math.round(chatWidthRef.current)),
                );
            } catch {
                /* ignore */
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', stop);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', stop);
        window.addEventListener('touchcancel', stop);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', stop);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', stop);
            window.removeEventListener('touchcancel', stop);
        };
    }, []);

    const beginDrag = useCallback(
        (clientX: number) => {
            dragRef.current = {
                startX: clientX,
                startWidth: chatWidthRef.current,
                active: true,
            };
            setIsDragging(true);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        },
        [],
    );

    const onHandleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            // Left mouse button only.
            if (e.button !== 0) return;
            e.preventDefault();
            beginDrag(e.clientX);
        },
        [beginDrag],
    );

    const onHandleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length === 0) return;
            beginDrag(e.touches[0].clientX);
        },
        [beginDrag],
    );

    const onHandleDoubleClick = useCallback(() => {
        if (typeof window === 'undefined') return;
        const next = clampWidth(CHAT_WIDTH_DEFAULT, window.innerWidth);
        setChatWidth(next);
        try {
            window.localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next));
        } catch {
            /* ignore */
        }
    }, []);

    const onHandleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (typeof window === 'undefined') return;
            const step = e.shiftKey ? 32 : 16;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setChatWidth((w) => clampWidth(w - step, window.innerWidth));
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setChatWidth((w) => clampWidth(w + step, window.innerWidth));
            } else if (e.key === 'Home') {
                e.preventDefault();
                setChatWidth(CHAT_WIDTH_MIN);
            } else if (e.key === 'End') {
                e.preventDefault();
                setChatWidth(
                    clampWidth(CHAT_WIDTH_MAX_FALLBACK, window.innerWidth),
                );
            }
        },
        [],
    );

    const activeContent =
        props.activeFile != null ? props.files[props.activeFile] ?? '' : '';

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
            {/* Top header — small, with home link + project title */}
            <header className="shrink-0 flex items-center gap-3 h-11 px-3 border-b border-border-subtle bg-background">
                <SimpleTooltip content="Back" side="bottom">
                    <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-foreground-muted hover:text-foreground"
                    >
                        <Link href="/code" aria-label="Back to Builder home">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                </SimpleTooltip>
                <div className="text-[13px] font-medium text-foreground truncate">
                    {props.title}
                </div>
                <div className="flex-1" />

                {/* Mobile-only segmented switch */}
                <div className="md:hidden inline-flex items-center rounded-lg bg-surface-2 p-0.5 border border-border-subtle">
                    <button
                        onClick={() => setMobileTab('chat')}
                        className={cn(
                            'h-7 px-2.5 rounded-md text-[12px] font-medium',
                            mobileTab === 'chat'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-foreground-muted',
                        )}
                    >
                        Chat
                    </button>
                    <button
                        onClick={() => setMobileTab('right')}
                        className={cn(
                            'h-7 px-2.5 rounded-md text-[12px] font-medium',
                            mobileTab === 'right'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-foreground-muted',
                        )}
                    >
                        Code
                    </button>
                </div>
            </header>

            <div className="flex-1 min-h-0 flex">
                {/* ── LEFT: chat panel ── */}
                <aside
                    style={isDesktop ? { width: `${chatWidth}px` } : undefined}
                    className={cn(
                        'bg-background flex flex-col min-h-0',
                        // On mobile, take the whole row when chat tab is active.
                        mobileTab === 'chat' ? 'flex' : 'hidden',
                        // Desktop fallback width prior to hydration so there's
                        // no layout flash, plus border on the right when the
                        // resize handle is hidden.
                        'md:flex md:shrink-0 md:w-[380px] border-r border-border-subtle md:border-r-0',
                    )}
                >
                    <BuilderChatPanel
                        messages={props.messages}
                        isStreaming={props.isStreaming}
                        error={props.error}
                        models={props.models}
                        selectedModelId={props.selectedModelId}
                        onModelChange={props.onModelChange}
                        onSend={props.onSend}
                        onStop={props.onStop}
                        onOpenReview={handleOpenReview}
                    />
                </aside>

                {/* ── RESIZE HANDLE (desktop only) ── */}
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize chat panel"
                    aria-valuemin={CHAT_WIDTH_MIN}
                    aria-valuemax={CHAT_WIDTH_MAX_FALLBACK}
                    aria-valuenow={Math.round(chatWidth)}
                    tabIndex={0}
                    onMouseDown={onHandleMouseDown}
                    onTouchStart={onHandleTouchStart}
                    onDoubleClick={onHandleDoubleClick}
                    onKeyDown={onHandleKeyDown}
                    title="Drag to resize · double-click to reset"
                    className={cn(
                        // Hidden on mobile; thin strip on desktop.
                        'hidden md:flex shrink-0 relative items-stretch',
                        'w-1 cursor-col-resize select-none group',
                        'bg-border-subtle hover:bg-foreground/30 transition-colors',
                        'focus:outline-none focus-visible:bg-foreground/40',
                        isDragging && 'bg-foreground/40',
                    )}
                >
                    {/* Wider invisible hit-area so the handle is easier to grab */}
                    <span
                        aria-hidden
                        className="absolute inset-y-0 -left-1.5 -right-1.5"
                    />
                </div>

                {/* ── RIGHT: editor / preview ── */}
                <section
                    className={cn(
                        'flex-1 min-w-0 flex flex-col bg-background',
                        mobileTab === 'right' ? 'flex' : 'hidden',
                        'md:flex',
                    )}
                >
                    <div className="shrink-0 flex items-center justify-between gap-2 h-11 px-3 border-b border-border-subtle bg-background">
                        <ViewToggle
                            value={view}
                            onChange={setView}
                            reviewCount={pendingReviewCount}
                        />
                        <span className="text-[11px] text-foreground-subtle">
                            {view === 'review'
                                ? `${pendingReviewCount} pending`
                                : `${Object.keys(props.files).length} files`}
                        </span>
                    </div>

                    {view === 'editor' && (
                        <div className="flex-1 min-h-0 flex">
                            <div className="w-[220px] shrink-0 border-r border-border-subtle bg-surface overflow-y-auto">
                                <FileTree
                                    files={props.files}
                                    activeFile={props.activeFile}
                                    onSelectFile={props.onSelectFile}
                                />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col">
                                <CodeEditor
                                    path={props.activeFile}
                                    value={activeContent}
                                    onChange={(next) =>
                                        props.activeFile && props.onUpdateFile(props.activeFile, next)
                                    }
                                />
                            </div>
                        </div>
                    )}
                    {view === 'preview' && <CodePreview files={props.files} />}
                    {view === 'review' && (
                        <DiffPanel
                            messages={props.messages}
                            onAccept={props.onAcceptChanges}
                            onReject={props.onRejectChanges}
                        />
                    )}
                </section>
            </div>

            {/* Overlay during drag so iframes / editors don't swallow the
                pointer events and break the drag interaction. */}
            {isDragging && (
                <div
                    aria-hidden
                    className="fixed inset-0 z-50 cursor-col-resize"
                />
            )}
        </div>
    );
}
