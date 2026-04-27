/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { Input, Button } from '@/components/ui';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function AccountTab() {
    const { user, isLoading } = useAuth();
    const [name, setName] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);
    const [nameSaved, setNameSaved] = useState(false);

    const [isSendingReset, setIsSendingReset] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        const fetchUserData = async () => {
            if (user) {
                // Fetch the user's raw user metadata to grab the preset display_name
                const { data: { user: supabaseUser } } = await supabase.auth.getUser();
                if (supabaseUser?.user_metadata?.display_name) {
                    setName(supabaseUser.user_metadata.display_name);
                } else {
                    setName(user.email.split('@')[0]);
                }
            }
        };
        fetchUserData();
    }, [user, supabase.auth]);

    const handleSaveName = async () => {
        setIsSavingName(true);
        setNameSaved(false);
        setError(null);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                data: { display_name: name.trim() }
            });

            if (updateError) throw updateError;
            setNameSaved(true);
            setTimeout(() => setNameSaved(false), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to update name');
        } finally {
            setIsSavingName(false);
        }
    };

    const handleSendPasswordReset = async () => {
        setIsSendingReset(true);
        setResetSent(false);
        setError(null);

        try {
            const response = await fetch('/api/settings/password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            setResetSent(true);
            setTimeout(() => setResetSent(false), 5000);
        } catch (err: any) {
            setError(err.message || 'Failed to send password reset');
        } finally {
            setIsSendingReset(false);
        }
    };

    if (isLoading || !user) {
        return (
            <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-3">
            {error && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[12px] rounded-md">
                    {error}
                </div>
            )}

            {/* Profile Section */}
            <div className="space-y-2.5">
                <h3 className="text-[13px] font-semibold text-foreground">Profile</h3>
                <div className="space-y-2.5 max-w-sm">
                    <div className="space-y-1">
                        <label className="text-[12px] font-medium text-foreground">Email</label>
                        <Input value={user.email} disabled className="bg-white/5 h-8 text-[12px]" />
                        <p className="text-[10.5px] text-muted-foreground">Your email address cannot be changed.</p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[12px] font-medium text-foreground">Display Name</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. John Doe"
                            className="bg-transparent h-8 text-[12px]"
                        />
                    </div>
                </div>
                <Button
                    onClick={handleSaveName}
                    disabled={isSavingName || !name.trim()}
                    className="mt-2 h-7 px-3 text-[11px] gap-1.5"
                >
                    {isSavingName && <Loader2 className="h-3 w-3 animate-spin" />}
                    {nameSaved ? <><CheckCircle2 className="h-3 w-3" /> Saved</> : 'Save Display Name'}
                </Button>
            </div>

            {/* Security Section */}
            <div className="pt-4 border-t border-border space-y-2.5">
                <h3 className="text-[13px] font-semibold text-red-500">Security</h3>
                <div className="max-w-sm text-[11.5px] text-muted-foreground leading-snug">
                    <p>To change your password, we need to verify your identity. Click the button below and we will send a secure password reset link to <strong className="text-foreground">{user.email}</strong> via Twilio.</p>
                </div>

                <Button
                    variant="destructive"
                    onClick={handleSendPasswordReset}
                    disabled={isSendingReset || resetSent}
                    className="mt-2 h-7 px-3 text-[11px] gap-1.5"
                >
                    {isSendingReset && <Loader2 className="h-3 w-3 animate-spin" />}
                    {resetSent ? <><CheckCircle2 className="h-3 w-3" /> Reset Email Dispatched</> : 'Request Password Reset'}
                </Button>
            </div>
        </div>
    );
}
