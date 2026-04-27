/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useQuota } from '@/hooks/useQuota';
import { Progress } from '@/components/ui';
import { Sparkles, Loader2 } from 'lucide-react';

export function UsageTab() {
    const { user } = useAuth();
    const { models } = useChat();

    if (!user || !models || models.length === 0) {
        return (
            <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-3 pb-3">
            {models.map((model) => (
                <ModelUsageCard key={model.id} modelId={model.id} models={models} />
            ))}
        </div>
    );
}

// Extract to sub-component so it safely calls its own hooks
function ModelUsageCard({ modelId, models }: { modelId: string, models: any[] }) {
    const model = models.find(m => m.id === modelId);
    const quota = useQuota(modelId, models);

    if (!model) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const displayName = model.displayName || (model as any).display_name || model.id;
    const isPro = model.id.includes('pro');

    return (
        <div className="p-3.5 rounded-lg border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    {isPro && <Sparkles className="h-3.5 w-3.5 text-amber-400" />}
                    <h3 className="font-semibold text-foreground text-[13px]">{displayName}</h3>
                </div>
                {quota.loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                    <span className="text-[11.5px] font-medium text-muted-foreground">
                        {quota.pct >= 1 ? '100%' : `${(quota.pct * 100).toFixed(1)}%`} Used
                    </span>
                )}
            </div>

            <Progress value={quota.loading ? 0 : Math.min(quota.pct * 100, 100)} className="h-1.5" />

            <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{quota.used.toLocaleString()} tokens</span>
                <span>{quota.limit.toLocaleString()} limit</span>
            </div>

            {quota.isNearLimit && !quota.isExceeded && (
                <p className="text-[11px] text-amber-500 font-medium">
                    You are nearing your quota limit.
                </p>
            )}
            {quota.isExceeded && (
                <p className="text-[11px] text-red-500 font-medium">
                    You have exceeded your quota limit for this rolling window.
                </p>
            )}
        </div>
    );
}
