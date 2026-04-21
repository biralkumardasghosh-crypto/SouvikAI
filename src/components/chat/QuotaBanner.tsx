'use client';

import { AlertTriangle, XCircle } from 'lucide-react';

interface QuotaBannerProps {
    pct: number;
    used: number;
    limit: number;
}

function fmt(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return `${n}`;
}

export function QuotaBanner({ pct, used, limit }: QuotaBannerProps) {
    const exceeded = pct >= 1.0;
    const usedPct = Math.min(100, Math.round(pct * 100));

    if (exceeded) {
        return (
            <div className="mx-4 mb-2 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                    <strong>Quota exceeded</strong> — requests are blocked until the 5-hour window resets.
                    ({fmt(used)} / {fmt(limit)} tokens used)
                </span>
            </div>
        );
    }

    return (
        <div className="mx-4 mb-2 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
                You have used <strong>{usedPct}% of your quota</strong>.
                ({fmt(used)} / {fmt(limit)} tokens · resets every 5 hours)
            </span>
        </div>
    );
}
