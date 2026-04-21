'use client';

import { useState } from 'react';
import {
    Button,
    Input,
    Label,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui';
import { AIModel } from '@/types/chat';
import { Edit2, ShieldAlert, ShieldCheck } from 'lucide-react';

interface ModelsTableProps {
    models: AIModel[];
    isEditMode: boolean;
    onUpdate: (modelId: string, updates: Partial<AIModel>) => Promise<{ success: boolean }>;
}

export function ModelsTable({ models, isEditMode, onUpdate }: ModelsTableProps) {
    const [editDialog, setEditDialog] = useState<{ open: boolean; model: AIModel | null }>({
        open: false,
        model: null,
    });

    // Form states
    const [displayName, setDisplayName] = useState('');
    const [apiName, setApiName] = useState('');
    const [quotaLimit, setQuotaLimit] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const openEditModel = (model: AIModel) => {
        setEditDialog({ open: true, model });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setDisplayName(model.displayName || (model as any).display_name || '');
        setApiName(model.name || '');
        setQuotaLimit((model.quota_limit || 0).toString());
    };

    const handleUpdate = async () => {
        if (!editDialog.model) return;
        setIsLoading(true);
        const updates: Partial<AIModel> = {
            displayName,
            name: apiName,
            quota_limit: parseInt(quotaLimit, 10),
        };
        await onUpdate(editDialog.model.id, updates);
        setIsLoading(false);
        setEditDialog({ open: false, model: null });
    };

    const handleToggleSuspend = async (model: AIModel) => {
        setIsLoading(true);
        await onUpdate(model.id, { is_suspended: !model.is_suspended });
        setIsLoading(false);
    };

    if (!models || models.length === 0) {
        return (
            <div className="flex justify-center p-8 bg-card rounded-lg border border-border">
                <p className="text-muted-foreground">No models configured.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                            <tr>
                                <th className="px-6 py-3 font-medium">Internal ID</th>
                                <th className="px-6 py-3 font-medium">Display Name</th>
                                <th className="px-6 py-3 font-medium">API Identifier (Name)</th>
                                <th className="px-6 py-3 font-medium">Quota Limit</th>
                                <th className="px-6 py-3 font-medium">Status</th>
                                {isEditMode && <th className="px-6 py-3 text-right font-medium text-destructive">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {models.map((model) => (
                                <tr key={model.id} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs">{model.id}</td>
                                    <td className="px-6 py-4 font-medium">{model.displayName}</td>
                                    <td className="px-6 py-4 text-muted-foreground">{model.name}</td>
                                    <td className="px-6 py-4">{model.quota_limit.toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${model.is_suspended ? 'bg-destructive/20 text-destructive' : 'bg-emerald-500/20 text-emerald-500'}`}>
                                            {model.is_suspended ? 'Suspended' : 'Active'}
                                        </span>
                                    </td>
                                    {isEditMode && (
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isLoading}
                                                    onClick={() => openEditModel(model)}
                                                    className="h-8 w-8 p-0"
                                                >
                                                    <Edit2 className="h-4 w-4 text-blue-500" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isLoading}
                                                    onClick={() => handleToggleSuspend(model)}
                                                    className="h-8 w-8 p-0"
                                                >
                                                    {model.is_suspended ? (
                                                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                                    ) : (
                                                        <ShieldAlert className="h-4 w-4 text-destructive" />
                                                    )}
                                                </Button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Model Dialog */}
            <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, model: null })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Model Configuration</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Internal ID</Label>
                            <Input value={editDialog.model?.id || ''} disabled className="bg-muted" />
                            <p className="text-xs text-muted-foreground">Internal ID cannot be changed.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Display Name</Label>
                            <Input
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="e.g. Velocity 1"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>API Identifier (Name)</Label>
                            <Input
                                value={apiName}
                                onChange={(e) => setApiName(e.target.value)}
                                placeholder="e.g. qwen/qwen3.5-122b-a10b"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Quota Limit (Tokens / 5 hrs)</Label>
                            <Input
                                type="number"
                                value={quotaLimit}
                                onChange={(e) => setQuotaLimit(e.target.value)}
                                placeholder="500000"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setEditDialog({ open: false, model: null })}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleUpdate}
                            disabled={isLoading || !displayName.trim() || !apiName.trim() || !quotaLimit.trim()}
                        >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
