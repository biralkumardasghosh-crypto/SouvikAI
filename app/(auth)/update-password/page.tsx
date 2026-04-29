/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@/components/ui';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        setIsLoading(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password,
            });
            if (updateError) throw updateError;

            setIsSuccess(true);
            setTimeout(() => router.push('/'), 2500);
        } catch (err: any) {
            setError(err.message || 'Failed to update password.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="text-left">
                <div className="flex items-center gap-2.5 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-success" strokeWidth={1.75} />
                    <h1 className="text-[22px] font-semibold tracking-tight">
                        Password updated
                    </h1>
                </div>
                <p className="text-[14px] text-foreground-muted leading-relaxed">
                    Your password has been changed. Redirecting you to your workspace
                    now&hellip;
                </p>
            </div>
        );
    }

    return (
        <div>
            <AuthHeader
                title="Set a new password"
                description="Choose a strong password you don't use anywhere else."
            />

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div
                        role="alert"
                        className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] text-destructive animate-slide-up"
                    >
                        {error}
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[13px] font-medium">
                        New password
                    </Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={isLoading}
                            autoComplete="new-password"
                            className="pr-10"
                        />
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-sm text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showPassword ? (
                                <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                            ) : (
                                <Eye className="h-4 w-4" strokeWidth={1.5} />
                            )}
                        </button>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label
                        htmlFor="confirmPassword"
                        className="text-[13px] font-medium"
                    >
                        Confirm new password
                    </Label>
                    <div className="relative">
                        <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Re-enter your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            disabled={isLoading}
                            autoComplete="new-password"
                            className="pr-10"
                        />
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            aria-label={
                                showConfirmPassword ? 'Hide password' : 'Show password'
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-sm text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                            ) : (
                                <Eye className="h-4 w-4" strokeWidth={1.5} />
                            )}
                        </button>
                    </div>
                </div>

                <Button
                    type="submit"
                    size="lg"
                    className="w-full mt-2"
                    disabled={isLoading || !password || !confirmPassword}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Updating
                        </>
                    ) : (
                        'Update password'
                    )}
                </Button>
            </form>
        </div>
    );
}
