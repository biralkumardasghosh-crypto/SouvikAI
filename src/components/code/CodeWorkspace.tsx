'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowLeft,
    File as FileIcon,
    RefreshCw,
    Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, SimpleTooltip } from '@/components/ui';
import { BuilderChatPanel } from './BuilderChatPanel';
import { CodeEditor } from '../editor/CodeEditor';
import { EditorTabs } from '../editor/EditorTabs';
import { Breadcrumb } from '../editor/Breadcrumb';
import { Minimap } from '../editor/Minimap';
import { StatusBar } from '../editor/StatusBar';
import { CodePreview, buildPreviewHTML } from './CodePreview';
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
    onSelectFile: (path: string | null) => void;
    onUpdateFile: (path: string, content: string) => void;
    onSend: (text: string) => void;
    onStop: () => void;
    onAcceptChanges: (messageId: string, paths?: string[] | null) => Promise<void>;
    onRejectChanges: (messageId: string, paths?: string[] | null) => Promise<void>;
}

const CHAT_WIDTH_STORAGE_KEY = 'code:chatPanelWidth';
const CHAT_WIDTH_DEFAULT = 360;
const CHAT_WIDTH_MIN = 260;
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
 * The right pane swaps between the file editor, the live preview, and the
 * pending-changes review surface via {@link ViewToggle}. A single unified
 * toolbar (h-10) at the top of the right pane hosts the toggle plus the
 * view-specific context (file path / preview status / pending count) and
 * the view-specific action (preview reload). Eliminating the per-view
 * sub-toolbars buys a row of vertical real estate and keeps all chrome on
 * a single horizontal rhythm with the workspace header.
 *
 * On desktop the divider between the two panes can be dragged to resize
 * them; the chosen width is persisted in localStorage. On mobile the
 * layout collapses to a single column with a tab bar at the top to switch
 * between chat / right-pane, and the resize handle is hidden.
 */
export function CodeWorkspace(props: CodeWorkspaceProps) {
    const [view, setView] = useState<WorkspaceView>('editor');
    const [mobileTab, setMobileTab] = useState<'chat' | 'right'>('chat');
    const [reloadKey, setReloadKey] = useState(0);

    // Advanced editor state
    const [openTabs, setOpenTabs] = useState<string[]>([]);
    const [showMinimap, setShowMinimap] = useState(true);
    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const scrollRef = useRef<HTMLDivElement>(null);

    // Keep tabs in sync with active file
    useEffect(() => {
        if (props.activeFile && !openTabs.includes(props.activeFile)) {
            setOpenTabs(prev => [...prev, props.activeFile!]);
        }
    }, [props.activeFile, openTabs]);

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

    // Compile the live preview only when the preview view is active. The
    // resulting `warning` is surfaced inline with the toolbar so users see
    // it next to the reload control without an extra row of chrome.
    const preview = useMemo(
        () => (view === 'preview' ? buildPreviewHTML(props.files) : null),
        [view, props.files],
    );

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

    const fileCount = Object.keys(props.files).length;

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
            {/* Top header — single source of truth for brand + project title. */}
            <header className="shrink-0 flex items-center gap-2 h-10 px-3 border-b border-border-subtle bg-background">
                <SimpleTooltip content="Back" side="bottom">
                    <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-foreground-muted hover:text-foreground"
                    >
                        <Link href="/code" aria-label="Back to Code home">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                </SimpleTooltip>

                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="h-5 w-5 rounded-md bg-foreground text-background flex items-center justify-center">
                        <Sparkles className="h-3 w-3" />
                    </div>
                    <span className="text-[13px] font-semibold text-foreground hidden sm:inline">
                        Code
                    </span>
                </div>

                <span className="h-4 w-px bg-border-subtle mx-1 shrink-0" aria-hidden />

                <div className="text-[13px] font-medium text-foreground truncate min-w-0">
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
                        'md:flex md:shrink-0 md:w-[360px] border-r border-border-subtle md:border-r-0',
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
                    {/* Single unified right-pane toolbar (h-10).
                        Layout: [ViewToggle] · [contextual middle (truncates)] · [actions + counter]
                        The middle slot adapts per view so we never need a
                        second sub-toolbar inside the editor or preview. */}
                    <div className="shrink-0 flex items-center gap-2 h-10 px-3 border-b border-border-subtle bg-background">
                        <ViewToggle
                            value={view}
                            onChange={setView}
                            reviewCount={pendingReviewCount}
                        />

                        <div className="hidden md:flex flex-1 min-w-0 items-center gap-1.5 text-foreground-muted">
                            {view === 'editor' && props.activeFile && (
                                <>
                                    <FileIcon className="h-3.5 w-3.5 shrink-0" />
                                    <code className="font-mono text-[12px] truncate">
                                        {props.activeFile}
                                    </code>
                                </>
                            )}
                            {view === 'preview' &&
                                (preview?.warning ? (
                                    <>
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                                        <span className="text-[12px] text-warning truncate">
                                            {preview.warning}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-[12px]">Live preview</span>
                                ))}
                            {view === 'review' && (
                                <span className="text-[12px]">Review pending changes</span>
                            )}
                        </div>

                        <div className="ml-auto md:ml-0 flex items-center gap-2 shrink-0">
                            {view === 'preview' && (
                                <SimpleTooltip content="Reload preview" side="bottom">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => setReloadKey((k) => k + 1)}
                                        aria-label="Reload preview"
                                        className="h-7 w-7 text-foreground-muted hover:text-foreground"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                </SimpleTooltip>
                            )}
                            <span className="text-[11px] text-foreground-subtle tabular-nums">
                                {view === 'review'
                                    ? `${pendingReviewCount} pending`
                                    : `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
                            </span>
                        </div>
                    </div>

                    {view === 'editor' && (
                        <div className="flex-1 min-h-0 flex">
                            <div className="w-[200px] shrink-0 border-r border-[#3e3e42] bg-[#252526] overflow-y-auto">
                                <FileTree
                                    files={props.files}
                                    activeFile={props.activeFile}
                                    onSelectFile={props.onSelectFile}
                                />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col bg-[#1e1e1e]">
                                <EditorTabs
                                    openTabs={openTabs}
                                    activePath={props.activeFile}
                                    onSelect={props.onSelectFile}
                                    onClose={path => {
                                        setOpenTabs(prev => prev.filter(p => p !== path));
                                        if (props.activeFile === path) {
                                            props.onSelectFile(openTabs.find(p => p !== path) ?? null);
                                        }
                                    }}
                                />
                                <Breadcrumb activePath={props.activeFile} />
                                <div className="flex-1 min-h-0 flex relative">
                                    <CodeEditor
                                        path={props.activeFile}
                                        value={activeContent}
                                        onChange={(next) =>
                                            props.activeFile && props.onUpdateFile(props.activeFile, next)
                                        }
                                        onPositionChange={(line, col) => setCursorPos({ line, col })}
                                        scrollRef={scrollRef}
                                    />
                                    <Minimap
                                        path={props.activeFile}
                                        content={activeContent}
                                        scrollContainerRef={scrollRef}
                                        isVisible={showMinimap}
                                        onToggle={() => setShowMinimap(!showMinimap)}
                                    />
                                </div>
                                <StatusBar
                                    activePath={props.activeFile}
                                    line={cursorPos.line}
                                    col={cursorPos.col}
                                    isSaving={false}
                                />
                            </div>
                        </div>
                    )}
                    {view === 'preview' && preview && (
                        <CodePreview html={preview.html} reloadKey={reloadKey} />
                    )}
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
