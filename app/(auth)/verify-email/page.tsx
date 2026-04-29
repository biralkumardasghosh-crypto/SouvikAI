'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { Button } from '@/components/ui';
import { Loader2, ArrowLeft } from 'lucide-react';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const email = searchParams.get('email');

    if (!email) {
        return (
            <div>
                <AuthHeader
                    title="Missing email"
                    description="We can't verify your account without an email address."
                />
                <Button asChild variant="outline" size="lg" className="w-full">
                    <Link href="/signup">
                        <ArrowLeft className="h-4 w-4" />
                        Back to sign up
                    </Link>
                </Button>
            </div>
        );
    }

    return <VerifyEmailForm email={decodeURIComponent(email)} />;
}

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-[260px] items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
                </div>
            }
        >
            <VerifyEmailContent />
        </Suspense>
    );
}
