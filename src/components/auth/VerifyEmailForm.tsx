'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OtpInput } from './OtpInput';
import {
    Card, CardHeader, CardTitle, CardDescription,
    CardContent, CardFooter, Button,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Mail, ArrowLeft, RefreshCw } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 30;
const SESSION_PASSWORD_KEY    = 'pending_signup_password';

interface VerifyEmailFormProps {
    email: string;
}

/**
 * Shown after sign-up — the user enters the 6-digit code they received by email.
 *
 * Flow:
 *  1. Reads the pending password from sessionStorage (set by SignUpPage).
 *  2. On submit: POST /api/auth/verify-and-signup with email + code + password.
 *  3. On success: signs the user in and redirects to /.
 *  4. If sessionStorage is empty (direct navigation): shows a graceful error.
 */
export function VerifyEmailForm({ email }: VerifyEmailFormProps) {
    const router = useRouter();
    const { signIn } = useAuth();

    const [code, setCode]             = useState('');
    const [error, setError]           = useState('');
    const [success, setSuccess]       = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResending, setIsResending]   = useState(false);
    const [cooldown, setCooldown]     = useState(RESEND_COOLDOWN_SECONDS);
    const [sessionMissing, setSessionMissing] = useState(false);

    // Check that we actually have the pending password in sessionStorage
    useEffect(() => {
        const stored = sessionStorage.getItem(SESSION_PASSWORD_KEY);
        if (!stored) setSessionMissing(true);
    }, []);

    // Resend cooldown countdown
    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const handleResend = useCallback(async () => {
        if (cooldown > 0 || isResending) return;
        setIsResending(true);
        setError('');
        try {
            const res = await fetch('/api/auth/send-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error ?? 'Failed to resend code.');
            } else {
                setCooldown(RESEND_COOLDOWN_SECONDS);
                setCode('');
            }
        } finally {
            setIsResending(false);
        }
    }, [cooldown, isResending, email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (code.replace(/\D/g, '').length < 6) {
            setError('Please enter the full 6-digit code.');
            return;
        }

        const password = sessionStorage.getItem(SESSION_PASSWORD_KEY);
        if (!password) {
            setSessionMissing(true);
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await fetch('/api/auth/verify-and-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: code.replace(/\D/g, ''), password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? 'Verification failed. Please try again.');
                return;
            }

            // Account created — clear the pending password and sign in
            sessionStorage.removeItem(SESSION_PASSWORD_KEY);
            setSuccess(true);

            const { error: signInError } = await signIn(email, password);
            if (signInError) {
                // Account was created but auto sign-in failed — send to sign-in page
                router.push('/signin?verified=1');
            } else {
                router.push('/');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Session-missing guard ───────────────────────────────────────────────
    if (sessionMissing) {
        return (
            <Card className="glass-card border-0 w-full max-w-md text-center">
                <CardContent className="pt-8 pb-6 space-y-4">
                    <p className="text-muted-foreground text-sm">
                        Your sign-up session has expired or is invalid.
                        <br />
                        Please start over.
                    </p>
                    <Button asChild variant="outline" className="mt-2">
                        <Link href="/signup">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to sign up
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="glass-card border-0 w-full max-w-md">
            <CardHeader className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <Mail className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-3xl font-bold tracking-tight">Check your email</CardTitle>
                <CardDescription className="text-base">
                    We sent a 6-digit code to{' '}
                    <span className="text-foreground font-medium">{email}</span>
                </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-6">
                    {/* Error */}
                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md animate-slide-up text-center">
                            {error}
                        </div>
                    )}

                    {/* Success state */}
                    {success && (
                        <div className="bg-green-500/10 text-green-400 text-sm p-3 rounded-md text-center">
                            Verified! Signing you in…
                        </div>
                    )}

                    {/* OTP boxes */}
                    <OtpInput
                        value={code}
                        onChange={setCode}
                        disabled={isSubmitting || success}
                        hasError={!!error}
                    />

                    <p className="text-xs text-muted-foreground text-center">
                        The code expires in 10 minutes.
                    </p>
                </CardContent>

                <CardFooter className="flex flex-col gap-3">
                    <Button
                        type="submit"
                        className="w-full h-11 text-base shadow-lg hover:shadow-xl transition-all duration-300"
                        disabled={isSubmitting || success || code.replace(/\D/g, '').length < 6}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying…
                            </>
                        ) : (
                            'Verify & create account'
                        )}
                    </Button>

                    {/* Resend */}
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={cooldown > 0 || isResending}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed mx-auto"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isResending ? 'animate-spin' : ''}`} />
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>

                    <div className="text-center text-sm text-muted-foreground">
                        Wrong email?{' '}
                        <Link href="/signup" className="text-primary font-medium hover:underline underline-offset-4">
                            Start over
                        </Link>
                    </div>
                </CardFooter>
            </form>
        </Card>
    );
}
