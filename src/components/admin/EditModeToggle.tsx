'use client';

import { Switch, Label } from '@/components/ui';
import { AlertTriangle } from 'lucide-react';

interface EditModeToggleProps {
    isEditMode: boolean;
    onToggle: () => void;
    disabled?: boolean;
}

export function EditModeToggle({ isEditMode, onToggle, disabled }: EditModeToggleProps) {
    return (
        <div className="flex items-center gap-4">
            {isEditMode && (
                <div className="flex items-center gap-2 text-yellow-500">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">Edit Mode Active - Users cannot send messages</span>
                </div>
            )}
            <div className="flex items-center gap-2">
                <Switch
                    id="edit-mode"
                    checked={isEditMode}
                    onCheckedChange={onToggle}
                    disabled={disabled}
                />
                <Label htmlFor="edit-mode" className="text-sm font-medium cursor-pointer">
                    Edit Mode
                </Label>
            </div>
        </div>
    );
}
