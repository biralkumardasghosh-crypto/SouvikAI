'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

/**
 * /verify-email?email=user@example.com
 *
 * Wrapped in Suspense because useSearchParams() requires it in Next.js 14.
 */
function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const email = searchParams.get('email');

    if (!email) {
        return (
            <div className="text-center space-y-4">
                <p className="text-muted-foreground text-sm">
                    No email address provided.
                </p>
                <Link
                    href="/signup"
                    className="text-primary text-sm font-medium hover:underline underline-offset-4"
                >
                    Back to sign up
                </Link>
            </div>
        );
    }

    return <VerifyEmailForm email={decodeURIComponent(email)} />;
}

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            }
        >
            <VerifyEmailContent />
        </Suspense>
    );
}
