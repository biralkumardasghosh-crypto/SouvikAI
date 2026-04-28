'use client';

import { useState } from 'react';
import {
    CheckCircle2,
    ChevronDown,
    Clock,
    FilePlus2,
    FilePen,
    FileX2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ShinyText from '@/components/ui/ShinyText';
import type { BuilderStep } from '@/types/code';

interface AgentTimelineProps {
    steps: BuilderStep[];
    /** True while the agent is still streaming. Drives the shimmer + auto-open. */
    isStreaming: boolean;
}

/**
 * Vertical timeline rendering the agent's milestones and file actions while
 * it works. Mirrors the look of {@link ThinkingTimeline} but with action-aware
 * icons (create / edit / delete).
 */
export function AgentTimeline({ steps, isStreaming }: AgentTimelineProps) {
    const [open, setOpen] = useState(true);
    const hasSteps = steps.length > 0;
    const lastStep = steps[steps.length - 1];

    // Pick a header label: if streaming, surface the current milestone (or a
    // generic "Working…"); otherwise show "N steps".
    let header: string;
    if (isStreaming) {
        const currentMilestone =
            lastStep && lastStep.kind === 'milestone' && lastStep.status === 'doing'
                ? lastStep.text
                : null;
        header = currentMilestone ?? 'Working…';
    } else if (hasSteps) {
        const milestoneCount = steps.filter((s) => s.kind === 'milestone').length;
        const actionCount = steps.filter((s) => s.kind === 'action').length;
        const parts: string[] = [];
        if (milestoneCount) parts.push(`${milestoneCount} step${milestoneCount === 1 ? '' : 's'}`);
        if (actionCount) parts.push(`${actionCount} change${actionCount === 1 ? '' : 's'}`);
        header = parts.join(' · ') || 'Done';
    } else {
        header = 'Working…';
    }

    return (
        <div className="my-1 not-prose animate-fade-in">
            <button
                type="button"
                onClick={() => hasSteps && setOpen((o) => !o)}
                className={cn(
                    'group flex items-center gap-2 text-sm transition-colors',
                    hasSteps
                        ? 'cursor-pointer text-muted-foreground hover:text-foreground'
                        : 'cursor-default text-muted-foreground',
                )}
                aria-expanded={open}
                disabled={!hasSteps}
            >
                {isStreaming ? (
                    <ShinyText
                        text={header}
                        speed={2.4}
                        delay={0.3}
                        color="#6b6b6b"
                        shineColor="#e0e0e0"
                        spread={90}
                        className="text-sm font-medium"
                    />
                ) : (
                    <span className="font-medium">{header}</span>
                )}
                {hasSteps && (
                    <ChevronDown
                        className={cn(
                            'h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-hover:opacity-100',
                            open && 'rotate-180',
                        )}
                    />
                )}
            </button>

            <div
                className={cn(
                    'overflow-hidden transition-all duration-300 ease-in-out',
                    open && hasSteps ? 'max-h-[2400px] opacity-100 mt-2' : 'max-h-0 opacity-0',
                )}
            >
                <div className="relative">
                    <div
                        className="absolute left-[9px] top-3 bottom-3 w-px bg-border/60"
                        aria-hidden
                    />

                    {steps.map((step) => (
                        <TimelineRow key={step.id}>
                            {renderStep(step, isStreaming)}
                        </TimelineRow>
                    ))}

                    {!isStreaming && hasSteps && (
                        <TimelineRow last>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/80" />
                                <span>Done</span>
                            </div>
                        </TimelineRow>
                    )}
                </div>
            </div>
        </div>
    );
}

function renderStep(step: BuilderStep, isStreaming: boolean): React.ReactNode {
    if (step.kind === 'milestone') {
        const isActive = isStreaming && step.status === 'doing';
        return (
            <div className="flex items-start gap-2.5">
                <span
                    className={cn(
                        'relative z-10 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-background mt-0.5',
                        isActive ? 'text-foreground' : 'text-muted-foreground/70',
                    )}
                >
                    <Clock className="h-3.5 w-3.5" />
                </span>
                <div className="flex-1 min-w-0">
                    {isActive ? (
                        <ShinyText
                            text={step.text}
                            speed={2.4}
                            delay={0.2}
                            color="#6b6b6b"
                            shineColor="#e0e0e0"
                            spread={90}
                            className="text-sm leading-relaxed"
                        />
                    ) : (
                        <p className="text-sm text-foreground/85 leading-relaxed m-0">
                            {step.text}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Action step
    const { action } = step;
    const { Icon, label, color } = describeAction(action.kind);

    return (
        <div className="flex items-start gap-2.5">
            <span
                className={cn(
                    'relative z-10 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-background mt-0.5',
                    color,
                )}
            >
                <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-sm text-foreground/85 leading-relaxed">{label}</span>
                <code className="text-[12px] font-mono px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle text-foreground-muted truncate">
                    {action.path}
                </code>
            </div>
        </div>
    );
}

function describeAction(kind: 'create' | 'edit' | 'delete') {
    switch (kind) {
        case 'create':
            return { Icon: FilePlus2, label: 'Created', color: 'text-emerald-500/85' };
        case 'edit':
            return { Icon: FilePen, label: 'Edited', color: 'text-sky-500/85' };
        case 'delete':
            return { Icon: FileX2, label: 'Deleted', color: 'text-rose-500/85' };
    }
}

function TimelineRow({
    children,
    last,
}: {
    children: React.ReactNode;
    last?: boolean;
}) {
    return (
        <div className={cn('relative', last ? 'mb-0' : 'mb-3')}>
            {children}
        </div>
    );
}
