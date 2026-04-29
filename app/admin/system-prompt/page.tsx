'use client';

import { useEffect, useState } from 'react';
import { SystemPromptEditor } from '@/components/admin';
import { useAdmin } from '@/hooks/useAdmin';
import { Loader2 } from 'lucide-react';

export default function AdminSystemPromptPage() {
    const { isEditMode, fetchSystemPrompt, updateSystemPrompt } = useAdmin();
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadPrompt = async () => {
            const promptContent = await fetchSystemPrompt();
            setContent(promptContent || '');
            setIsLoading(false);
        };
        loadPrompt();
    }, [fetchSystemPrompt]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">System Prompt</h1>
                <p className="text-muted-foreground">Configure the AI&apos;s base personality and instructions</p>
            </div>

            <SystemPromptEditor
                initialContent={content}
                isEditMode={isEditMode}
                onSave={updateSystemPrompt}
            />

            {!isEditMode && (
                <p className="text-sm text-muted-foreground text-center py-4">
                    Enable Edit Mode to modify the system prompt
                </p>
            )}
        </div>
    );
}
