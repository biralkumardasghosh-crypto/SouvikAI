'use client';

import { ModelsTable } from '@/components/admin';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminModelsPage() {
    const { models, isEditMode, updateModel } = useAdmin();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Model Configurations</h1>
                <p className="text-muted-foreground">Manage available AI models, their identifiers, display names, and quotas</p>
            </div>

            <ModelsTable
                models={models}
                isEditMode={isEditMode}
                onUpdate={updateModel}
            />

            {!isEditMode && (
                <p className="text-sm text-muted-foreground text-center py-4">
                    Enable Edit Mode to modify model configurations
                </p>
            )}
        </div>
    );
}
