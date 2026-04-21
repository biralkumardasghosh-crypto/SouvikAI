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
        <div className="space-y-6">
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
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isPro && <Sparkles className="h-4 w-4 text-amber-400" />}
                    <h3 className="font-semibold text-foreground text-lg">{displayName}</h3>
                </div>
                {quota.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                        {quota.pct >= 1 ? '100%' : `${(quota.pct * 100).toFixed(1)}%`} Used
                    </span>
                )}
            </div>

            <Progress value={quota.loading ? 0 : Math.min(quota.pct * 100, 100)} className="h-2" />

            <div className="flex justify-between text-sm text-muted-foreground">
                <span>{quota.used.toLocaleString()} tokens</span>
                <span>{quota.limit.toLocaleString()} limit</span>
            </div>

            {quota.isNearLimit && !quota.isExceeded && (
                <p className="text-sm text-amber-500 font-medium">
                    You are nearing your quota limit.
                </p>
            )}
            {quota.isExceeded && (
                <p className="text-sm text-red-500 font-medium">
                    You have exceeded your quota limit for this rolling window.
                </p>
            )}
        </div>
    );
}
