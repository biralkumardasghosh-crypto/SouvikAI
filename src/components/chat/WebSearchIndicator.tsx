'use client';

import { useState } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WebSearchState, WebSearchResult } from '@/types/chat';
import ShinyText from '@/components/ui/ShinyText';

interface WebSearchIndicatorProps {
    webSearch: WebSearchState;
}

/**
 * Compact, Perplexity-style search indicator.
 *
 *  • Searching → single-line shimmer with a small spinning globe.
 *  • Done      → pill with stacked source favicons + "N sources",
 *                expands into a horizontal scroller of source chips.
 */
export function WebSearchIndicator({ webSearch }: WebSearchIndicatorProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (webSearch.status === 'searching') {
        return (
            <div className="flex items-center gap-1.5 py-0.5 mb-1.5 animate-fade-in">
                <Globe className="h-3.5 w-3.5 text-blue-400/60 animate-pulse shrink-0" />
                <ShinyText
                    text="Searching the web…"
                    speed={2.5}
                    delay={0.4}
                    color="#6b6b6b"
                    shineColor="#e0e0e0"
                    spread={90}
                    className="text-xs font-medium"
                />
            </div>
        );
    }

    const { results } = webSearch;
    const stack = results.slice(0, 3);

    return (
        <div className="mb-2 animate-fade-in">
            {/* ── Compact pill ─────────────────────────────────── */}
            <button
                onClick={() => setIsOpen(o => !o)}
                className="inline-flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-border/80 text-xs text-muted-foreground hover:text-foreground transition-all group"
                aria-expanded={isOpen}
            >
                {/* Stacked favicons */}
                <span className="flex items-center -space-x-1.5">
                    {stack.map((r, i) => (
                        <span
                            key={i}
                            className="h-4 w-4 rounded-full bg-background border border-border/60 flex items-center justify-center overflow-hidden shrink-0"
                            style={{ zIndex: stack.length - i }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={r.favicon}
                                alt=""
                                width={10}
                                height={10}
                                className="opacity-90"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                        </span>
                    ))}
                </span>

                <span className="font-medium leading-none">
                    {results.length} source{results.length !== 1 ? 's' : ''}
                </span>

                <ChevronDown
                    className={cn(
                        'h-3 w-3 transition-transform duration-200',
                        isOpen && 'rotate-180',
                    )}
                />
            </button>

            {/* ── Expandable horizontal source row ─────────────── */}
            <div
                className={cn(
                    'overflow-hidden transition-all duration-300 ease-in-out',
                    isOpen ? 'max-h-[160px] opacity-100 mt-2' : 'max-h-0 opacity-0',
                )}
            >
                <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1 scrollbar-thin">
                    {results.map((result, i) => (
                        <SourceChip key={i} result={result} index={i + 1} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Source chip ──────────────────────────────────────────────────────────────

function SourceChip({ result, index }: { result: WebSearchResult; index: number }) {
    let domain = '';
    try {
        domain = new URL(result.url).hostname.replace(/^www\./, '');
    } catch {
        domain = result.url;
    }

    return (
        <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            title={result.title}
            className="group/chip shrink-0 w-[180px] flex flex-col gap-1 p-2 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/50 hover:border-border/80 transition-all no-underline"
        >
            {/* Header row: index + favicon + domain */}
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0 select-none">
                    {index}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={result.favicon}
                    alt=""
                    width={12}
                    height={12}
                    className="rounded-sm opacity-70 shrink-0"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
                <span className="text-[10px] text-muted-foreground/60 truncate">
                    {domain}
                </span>
            </div>

            {/* Title */}
            <p className="text-xs font-medium text-foreground/85 line-clamp-2 leading-snug group-hover/chip:text-blue-400 transition-colors">
                {result.title}
            </p>
        </a>
    );
}
