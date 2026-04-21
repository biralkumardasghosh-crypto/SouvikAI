'use client';

import { useState, useEffect } from 'react';
import { Button, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui';
import { Loader2, Save } from 'lucide-react';

interface SystemPromptEditorProps {
    initialContent: string;
    isEditMode: boolean;
    onSave: (content: string) => Promise<boolean>;
}

export function SystemPromptEditor({ initialContent, isEditMode, onSave }: SystemPromptEditorProps) {
    const [content, setContent] = useState(initialContent);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(true);

    useEffect(() => {
        setContent(initialContent);
    }, [initialContent]);

    useEffect(() => {
        setIsSaved(content === initialContent);
    }, [content, initialContent]);

    const handleSave = async () => {
        setIsLoading(true);
        const success = await onSave(content);
        setIsLoading(false);
        if (success) {
            setIsSaved(true);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>System Prompt</CardTitle>
                <CardDescription>
                    Configure the AI&apos;s behavior and personality. This prompt is sent with every request.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={!isEditMode}
                    className="min-h-[300px] font-mono text-sm"
                    placeholder="Enter the system prompt..."
                />
            </CardContent>
            <CardFooter className="flex justify-between">
                <p className="text-sm text-muted-foreground">
                    {isSaved ? 'All changes saved' : 'Unsaved changes'}
                </p>
                <Button
                    onClick={handleSave}
                    disabled={!isEditMode || isSaved || isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                </Button>
            </CardFooter>
        </Card>
    );
}
