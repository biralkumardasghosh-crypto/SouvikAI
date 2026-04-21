'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Button, Input, Label,
    Card, CardHeader, CardTitle, CardDescription,
    CardContent, CardFooter,
} from '@/components/ui';
import { Loader2 } from 'lucide-react';

const SESSION_PASSWORD_KEY = 'pending_signup_password';

/**
 * Sign-up page — new Twilio Verify flow.
 *
 * 1. User fills in email + password + confirm password.
 * 2. On submit: POST /api/auth/send-verification (email only).
 * 3. Password is stored in sessionStorage (client-side only, never sent to server here).
 * 4. On success: redirect to /verify-email?email=...
 */
export default function SignUpPage() {
    const router = useRouter();

    const [email, setEmail]                     = useState('');
    const [password, setPassword]               = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError]                     = useState('');
    const [isLoading, setIsLoading]             = useState(false);

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
                setError(data.error ?? 'Failed to send verification code. Please try again.');
                return;
            }

            // Store the password client-side so the verify page can complete sign-up
            sessionStorage.setItem(SESSION_PASSWORD_KEY, password);

            router.push(`/verify-email?email=${encodeURIComponent(email.toLowerCase().trim())}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="glass-card border-0">
            <CardHeader className="text-center space-y-2">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                    </svg>
                </div>
                <CardTitle className="text-3xl font-bold tracking-tight">Create account</CardTitle>
                <CardDescription className="text-base">
                    We&apos;ll send a verification code to your email
                </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md animate-slide-up">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="name@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                            className="bg-background/50 border-input/50 focus:bg-background transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={isLoading}
                            className="bg-background/50 border-input/50 focus:bg-background transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm password</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            disabled={isLoading}
                            className="bg-background/50 border-input/50 focus:bg-background transition-colors"
                        />
                    </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-4">
                    <Button
                        type="submit"
                        className="w-full h-11 text-base shadow-lg hover:shadow-xl transition-all duration-300"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending code…
                            </>
                        ) : (
                            'Continue'
                        )}
                    </Button>

                    <div className="text-center text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link href="/signin" className="text-primary font-medium hover:underline underline-offset-4">
                            Sign in
                        </Link>
                    </div>
                </CardFooter>
            </form>
        </Card>
    );
}
