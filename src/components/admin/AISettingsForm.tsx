'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Label, Slider, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui';
import { AdminSettings } from '@/types/admin';
import { Loader2, Save } from 'lucide-react';

interface AISettingsFormProps {
    settings: AdminSettings | null;
    isEditMode: boolean;
    onSave: (settings: Partial<AdminSettings>) => Promise<{ success: boolean }>;
}

export function AISettingsForm({ settings, isEditMode, onSave }: AISettingsFormProps) {
    const [temperature, setTemperature] = useState(0.7);
    const [maxTokens, setMaxTokens] = useState(2048);
    const [modelName, setModelName] = useState('meta/llama-3.1-8b-instruct');
    const [isLoading, setIsLoading] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (settings) {
            setTemperature(settings.temperature);
            setMaxTokens(settings.maxTokens);
            setModelName(settings.modelName);
        }
    }, [settings]);

    useEffect(() => {
        if (settings) {
            setHasChanges(
                temperature !== settings.temperature ||
                maxTokens !== settings.maxTokens ||
                modelName !== settings.modelName
            );
        }
    }, [temperature, maxTokens, modelName, settings]);

    const handleSave = async () => {
        setIsLoading(true);
        await onSave({ temperature, maxTokens, modelName });
        setIsLoading(false);
        setHasChanges(false);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>AI Settings</CardTitle>
                <CardDescription>
                    Configure the AI model parameters for all chat requests.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <Label>Temperature</Label>
                        <span className="text-sm text-muted-foreground">{temperature.toFixed(2)}</span>
                    </div>
                    <Slider
                        value={[temperature]}
                        onValueChange={([value]) => setTemperature(value)}
                        min={0}
                        max={2}
                        step={0.01}
                        disabled={!isEditMode}
                    />
                    <p className="text-xs text-muted-foreground">
                        Controls randomness. Lower values make responses more focused, higher values more creative.
                    </p>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between">
                        <Label>Max Tokens</Label>
                        <span className="text-sm text-muted-foreground">{maxTokens}</span>
                    </div>
                    <Slider
                        value={[maxTokens]}
                        onValueChange={([value]) => setMaxTokens(value)}
                        min={100}
                        max={4096}
                        step={100}
                        disabled={!isEditMode}
                    />
                    <p className="text-xs text-muted-foreground">
                        Maximum length of the AI response.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="model-name">Model Name</Label>
                    <Input
                        id="model-name"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        disabled={!isEditMode}
                        placeholder="meta/llama-3.1-8b-instruct"
                    />
                    <p className="text-xs text-muted-foreground">
                        NVIDIA NIM model identifier.
                    </p>
                </div>
            </CardContent>
            <CardFooter className="flex justify-between">
                <p className="text-sm text-muted-foreground">
                    {hasChanges ? 'Unsaved changes' : 'All changes saved'}
                </p>
                <Button
                    onClick={handleSave}
                    disabled={!isEditMode || !hasChanges || isLoading}
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
