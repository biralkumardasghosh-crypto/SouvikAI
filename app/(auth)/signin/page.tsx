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

export default function SignInPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOAuthLoading, setIsOAuthLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { signIn, signInWithGoogle } = useAuth();
    const router = useRouter();

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
        setIsLoading(true);

        const { error } = await signIn(email, password);
        if (error) {
            setError(error);
            setIsLoading(false);
        } else {
            router.push('/');
        }
    };

    const busy = isLoading || isOAuthLoading;

    return (
        <div>
            <AuthHeader
                title="Welcome back"
                description="Sign in to continue to Souvik AI."
            />

            <OAuthButton
                provider="google"
                loading={isOAuthLoading}
                disabled={busy}
                onClick={handleGoogleSignIn}
            />

            <div className="my-6">
                <Divider>Or continue with email</Divider>
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
                    <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-[13px] font-medium">
                            Password
                        </Label>
                        <Link
                            href="#"
                            className="text-[12px] text-foreground-muted hover:text-foreground transition-colors underline-offset-4 hover:underline"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={busy}
                            autoComplete="current-password"
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

                <Button
                    type="submit"
                    size="lg"
                    className="w-full mt-2"
                    disabled={busy || !email || !password}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Signing in
                        </>
                    ) : (
                        'Sign in'
                    )}
                </Button>
            </form>

            <p className="mt-6 text-center text-[13px] text-foreground-muted">
                Don&apos;t have an account?{' '}
                <Link
                    href="/signup"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                    Create one
                </Link>
            </p>
        </div>
    );
}
