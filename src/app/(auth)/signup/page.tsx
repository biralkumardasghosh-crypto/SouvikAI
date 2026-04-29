'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Label } from '@/components/ui';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { OAuthButton } from '@/components/auth/OAuthButton';
import { Divider } from '@/components/auth/Divider';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const SESSION_PASSWORD_KEY = 'pending_signup_password';

/**
 * Sign-up page — Twilio Verify flow.
 *
 * 1. User fills email + password + confirm password.
 * 2. POST /api/auth/send-verification (email only).
 * 3. Password is stashed in sessionStorage (never sent to server here).
 * 4. Redirects to /verify-email?email=...
 */
export default function SignUpPage() {
    const router = useRouter();
    const { signInWithGoogle } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOAuthLoading, setIsOAuthLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleGoogleSignIn = async () => {
        setIsOAuthLoading(true);
        setError('');
        const { error } = await signInWithGoogle();
        if (error) {
            setError(error);
            setIsOAuthLoading(false);
        }
    };

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
            const res = await fetch('/api/auth/send-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.toLowerCase().trim() }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(
                    data.error ?? 'Failed to send verification code. Please try again.'
                );
                return;
            }

            sessionStorage.setItem(SESSION_PASSWORD_KEY, password);
            router.push(
                `/verify-email?email=${encodeURIComponent(email.toLowerCase().trim())}`
            );
        } finally {
            setIsLoading(false);
        }
    };

    const busy = isLoading || isOAuthLoading;

    return (
        <div>
            <AuthHeader
                title="Create your account"
                description="We'll send a verification code to your email."
            />

            <OAuthButton
                provider="google"
                loading={isOAuthLoading}
                disabled={busy}
                onClick={handleGoogleSignIn}
            />

            <div className="my-6">
                <Divider>Or sign up with email</Divider>
            </div>

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
                    <Label htmlFor="email" className="text-[13px] font-medium">
                        Email
                    </Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={busy}
                        autoComplete="email"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[13px] font-medium">
                        Password
                    </Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={busy}
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
                    <Label htmlFor="confirmPassword" className="text-[13px] font-medium">
                        Confirm password
                    </Label>
                    <div className="relative">
                        <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Re-enter your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            disabled={busy}
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
                    disabled={busy || !email || !password || !confirmPassword}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending code
                        </>
                    ) : (
                        'Continue'
                    )}
                </Button>
            </form>

            <p className="mt-6 text-center text-[13px] text-foreground-muted">
                Already have an account?{' '}
                <Link
                    href="/signin"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                    Sign in
                </Link>
            </p>
        </div>
    );
}
