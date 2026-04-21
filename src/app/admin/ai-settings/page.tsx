'use client';

import { AISettingsForm } from '@/components/admin';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminAISettingsPage() {
    const { settings, isEditMode, updateSettings } = useAdmin();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">AI Settings</h1>
                <p className="text-muted-foreground">Configure AI model parameters</p>
            </div>

            <AISettingsForm
                settings={settings}
                isEditMode={isEditMode}
                onSave={updateSettings}
            />

            {!isEditMode && (
                <p className="text-sm text-muted-foreground text-center py-4">
                    Enable Edit Mode to modify AI settings
                </p>
            )}
        </div>
    );
}
