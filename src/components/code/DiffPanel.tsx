'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Check,
    CheckCircle2,
    ChevronRight,
    FileEdit,
    FilePlus2,
    FileX2,
    Loader2,
    Sparkles,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { computeLineDiff, type DiffRow, type DiffSummary } from '@/lib/code-agent/line-diff';
import type { BuilderMessage, PendingChange } from '@/types/code';

interface DiffPanelProps {
    /**
     * Assistant messages whose turns produced file changes that still
     * need review. The most recent message is shown first; the user
     * can scroll back through older still-pending reviews.
     */
    messages: BuilderMessage[];
    onAccept: (messageId: string, paths?: string[] | null) => Promise<void>;
    onReject: (messageId: string, paths?: string[] | null) => Promise<void>;
}

/**
 * Right-pane review surface. Shown when one or more assistant turns
 * produced file changes that haven't been accepted yet. Each turn is
 * rendered as its own collapsible review group; within a group the
 * user picks a file in the left rail to see a side-by-side diff in
 * the main column. They can accept or reject each file individually,
 * or use the group-level "Accept all" / "Reject all" actions.
 *
 * The empty state — when there is nothing left to review — shows a
 * lightweight "you're all caught up" message instead of disappearing,
 * so users who navigated to the Review tab on purpose still get
 * feedback.
 */
export function DiffPanel({ messages, onAccept, onReject }: DiffPanelProps) {
    const reviewable = messages.filter((m) => (m.review?.pending.length ?? 0) > 0);

    if (reviewable.length === 0) {
        return <EmptyReviewState />;
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-background">
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="flex flex-col gap-6 p-4 max-w-full">
                    {reviewable.map((msg) => (
                        <ReviewGroup
                            key={msg.id}
                            message={msg}
                            onAccept={onAccept}
                            onReject={onReject}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────
// One review group = one assistant turn's pending changes.
// ──────────────────────────────────────────────────────────────────────

interface ReviewGroupProps {
    message: BuilderMessage;
    onAccept: (messageId: string, paths?: string[] | null) => Promise<void>;
    onReject: (messageId: string, paths?: string[] | null) => Promise<void>;
}

function ReviewGroup({ message, onAccept, onReject }: ReviewGroupProps) {
    const review = message.review!;
    const [activePath, setActivePath] = useState<string | null>(
        review.pending[0]?.path ?? null,
    );
    const [busyAll, setBusyAll] = useState<null | 'accept' | 'reject'>(null);
    const [busyPaths, setBusyPaths] = useState<Set<string>>(new Set());

    // Keep the focused path valid when entries are accepted/rejected
    // and the list shrinks.
    useEffect(() => {
        if (!review.pending.length) {
            setActivePath(null);
            return;
        }
        if (!activePath || !review.pending.some((c) => c.path === activePath)) {
            setActivePath(review.pending[0].path);
        }
    }, [review.pending, activePath]);

    const activeChange = useMemo(
        () => review.pending.find((c) => c.path === activePath) ?? null,
        [review.pending, activePath],
    );

    const reviewedCount = review.total - review.pending.length;

    const markBusy = (path: string, on: boolean) => {
        setBusyPaths((prev) => {
            const next = new Set(prev);
            if (on) next.add(path);
            else next.delete(path);
            return next;
        });
    };

    const handleAcceptOne = async (path: string) => {
        markBusy(path, true);
        try {
            await onAccept(message.id, [path]);
        } finally {
            markBusy(path, false);
        }
    };
    const handleRejectOne = async (path: string) => {
        markBusy(path, true);
        try {
            await onReject(message.id, [path]);
        } finally {
            markBusy(path, false);
        }
    };
    const handleAcceptAll = async () => {
        setBusyAll('accept');
        try {
            await onAccept(message.id, null);
        } finally {
            setBusyAll(null);
        }
    };
    const handleRejectAll = async () => {
        setBusyAll('reject');
        try {
            await onReject(message.id, null);
        } finally {
            setBusyAll(null);
        }
    };

    return (
        <section
            aria-label="Review changes from agent turn"
            className="rounded-lg border border-border-subtle bg-surface overflow-hidden"
        >
            {/* Header */}
            <header className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border-subtle bg-surface-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                    <h3 className="text-[12px] font-semibold text-foreground truncate">
                        Review changes
                    </h3>
                    <span
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-background border border-border-subtle text-foreground-muted"
                        aria-label={`${review.pending.length} pending of ${review.total}`}
                    >
                        {review.pending.length} / {review.total}
                    </span>
                    {reviewedCount > 0 && (
                        <span className="text-[11px] text-foreground-subtle">
                            {reviewedCount} reviewed
                        </span>
                    )}
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[12px] text-foreground-muted hover:text-destructive"
                        disabled={busyAll !== null}
                        onClick={handleRejectAll}
                    >
                        {busyAll === 'reject' ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                            <X className="h-3.5 w-3.5 mr-1" />
                        )}
                        Reject all
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 text-[12px]"
                        disabled={busyAll !== null}
                        onClick={handleAcceptAll}
                    >
                        {busyAll === 'accept' ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                            <Check className="h-3.5 w-3.5 mr-1" />
                        )}
                        Accept all
                    </Button>
                </div>
            </header>

            {/* Body — two-column on desktop, stacked on mobile */}
            <div className="flex flex-col md:flex-row min-h-[280px] max-h-[70vh]">
                {/* File list */}
                <nav
                    aria-label="Pending files"
                    className={cn(
                        'shrink-0 border-border-subtle bg-background',
                        'md:w-56 md:border-r',
                        'border-b md:border-b-0',
                        'overflow-x-auto md:overflow-y-auto md:overflow-x-hidden',
                    )}
                >
                    <ul className="flex md:flex-col gap-0 p-1 md:p-1.5 min-w-max md:min-w-0">
                        {review.pending.map((change) => (
                            <li key={change.path}>
                                <FileRailButton
                                    change={change}
                                    active={activePath === change.path}
                                    busy={busyPaths.has(change.path)}
                                    onSelect={() => setActivePath(change.path)}
                                    onAccept={() => handleAcceptOne(change.path)}
                                    onReject={() => handleRejectOne(change.path)}
                                />
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Active diff */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {activeChange ? (
                        <DiffView change={activeChange} />
                    ) : (
                        <div className="flex-1 grid place-items-center text-foreground-subtle text-sm p-6">
                            Select a file to view changes
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

// ──────────────────────────────────────────────────────────────────────
// File rail row.
// ──────────────────────────────────────────────────────────────────────

function FileRailButton({
    change,
    active,
    busy,
    onSelect,
    onAccept,
    onReject,
}: {
    change: PendingChange;
    active: boolean;
    busy: boolean;
    onSelect: () => void;
    onAccept: () => void;
    onReject: () => void;
}) {
    const meta = describeKind(change.kind);
    return (
        <div
            className={cn(
                'group flex items-center gap-1.5 rounded-md text-left transition-colors',
                'pl-1.5 pr-1 py-1.5',
                active
                    ? 'bg-surface-2 text-foreground'
                    : 'hover:bg-surface-2/60 text-foreground-muted',
            )}
        >
            <button
                type="button"
                onClick={onSelect}
                aria-pressed={active}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
            >
                <span className={cn('shrink-0', meta.color)}>
                    <meta.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[12px] font-mono truncate" title={change.path}>
                    {basename(change.path)}
                </span>
                <ChevronRight
                    className={cn(
                        'h-3 w-3 ml-auto opacity-0 transition-opacity',
                        active && 'opacity-60',
                    )}
                />
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
                <button
                    type="button"
                    onClick={onReject}
                    disabled={busy}
                    title="Reject change to this file"
                    aria-label={`Reject ${change.path}`}
                    className={cn(
                        'h-6 w-6 rounded grid place-items-center transition-colors',
                        'text-foreground-subtle hover:text-destructive hover:bg-destructive/10',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                >
                    {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <X className="h-3 w-3" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={onAccept}
                    disabled={busy}
                    title="Accept change to this file"
                    aria-label={`Accept ${change.path}`}
                    className={cn(
                        'h-6 w-6 rounded grid place-items-center transition-colors',
                        'text-foreground-subtle hover:text-emerald-500 hover:bg-emerald-500/10',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                >
                    {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <Check className="h-3 w-3" />
                    )}
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────
// Side-by-side diff view for one file.
// ──────────────────────────────────────────────────────────────────────

function DiffView({ change }: { change: PendingChange }) {
    const summary: DiffSummary = useMemo(
        () => computeLineDiff(change.before, change.after),
        [change.before, change.after],
    );

    const meta = describeKind(change.kind);

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Path header */}
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border-subtle bg-surface text-[12px]">
                <span className={cn('shrink-0', meta.color)}>
                    <meta.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="font-medium text-foreground">{meta.label}</span>
                <code className="font-mono text-foreground-muted truncate" title={change.path}>
                    {change.path}
                </code>
                {change.renamedFrom && (
                    <RenameTag prefix="from" path={change.renamedFrom} />
                )}
                {change.renamedTo && (
                    <RenameTag prefix="to" path={change.renamedTo} />
                )}
                <div className="flex-1" />
                <DiffStat additions={summary.additions} removals={summary.removals} />
            </div>

            {/* Diff body */}
            <div className="flex-1 min-h-0 overflow-auto bg-background font-mono text-[12px] leading-[1.55]">
                {summary.rows.length === 0 ? (
                    <div className="px-3 py-4 text-foreground-subtle">
                        No textual changes to display.
                    </div>
                ) : (
                    <table className="w-full border-collapse">
                        <colgroup>
                            <col className="w-10" />
                            <col />
                            <col className="w-10" />
                            <col />
                        </colgroup>
                        <tbody>
                            {summary.rows.map((row, idx) => (
                                <DiffRowView key={idx} row={row} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function DiffRowView({ row }: { row: DiffRow }) {
    // Per-side background tints. We use light tints over the regular
    // background colour so the diff stays legible in both light and
    // dark themes.
    const leftTint =
        row.kind === 'remove' || row.kind === 'change'
            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
            : '';
    const rightTint =
        row.kind === 'add' || row.kind === 'change'
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : '';

    return (
        <tr className="align-top">
            <td
                className={cn(
                    'select-none text-right pr-2 pl-2 py-px text-foreground-subtle',
                    leftTint,
                )}
            >
                {row.leftNumber ?? ''}
            </td>
            <td className={cn('whitespace-pre pr-3 py-px', leftTint)}>
                {row.left ?? ''}
            </td>
            <td
                className={cn(
                    'select-none text-right pr-2 pl-2 py-px text-foreground-subtle border-l border-border-subtle',
                    rightTint,
                )}
            >
                {row.rightNumber ?? ''}
            </td>
            <td className={cn('whitespace-pre pr-3 py-px', rightTint)}>
                {row.right ?? ''}
            </td>
        </tr>
    );
}

function DiffStat({ additions, removals }: { additions: number; removals: number }) {
    if (additions === 0 && removals === 0) return null;
    return (
        <span className="inline-flex items-center gap-2 text-[11px] font-mono">
            {additions > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
            )}
            {removals > 0 && (
                <span className="text-rose-600 dark:text-rose-400">−{removals}</span>
            )}
        </span>
    );
}

function RenameTag({ prefix, path }: { prefix: 'from' | 'to'; path: string }) {
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-foreground-muted">
            <span className="text-foreground-subtle">{prefix}</span>
            <code className="font-mono px-1 py-0.5 rounded bg-surface-2 border border-border-subtle text-foreground-muted">
                {path}
            </code>
        </span>
    );
}

// ──────────────────────────────────────────────────────────────────────
// Empty state (no pending review).
// ──────────────────────────────────────────────────────────────────────

function EmptyReviewState() {
    return (
        <div className="flex-1 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3 text-center max-w-sm px-6 py-10">
                <div className="h-9 w-9 rounded-full bg-surface-2 flex items-center justify-center text-emerald-500">
                    <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="text-[14px] font-semibold text-foreground">
                    All caught up
                </h3>
                <p className="text-[13px] text-foreground-muted leading-relaxed">
                    There are no pending changes to review. When the agent edits files,
                    they&apos;ll show up here for you to accept or reject before they
                    land in your project.
                </p>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers.
// ──────────────────────────────────────────────────────────────────────

function describeKind(kind: PendingChange['kind']): {
    Icon: typeof FileEdit;
    label: string;
    color: string;
} {
    switch (kind) {
        case 'create':
            return { Icon: FilePlus2, label: 'Created', color: 'text-emerald-500/85' };
        case 'edit':
            return { Icon: FileEdit, label: 'Edited', color: 'text-sky-500/85' };
        case 'delete':
            return { Icon: FileX2, label: 'Deleted', color: 'text-rose-500/85' };
    }
}

function basename(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.slice(idx + 1) : path;
}
