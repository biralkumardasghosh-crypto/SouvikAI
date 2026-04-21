import { NextRequest, NextResponse } from 'next/server';
import { checkVerificationCode } from '@/lib/twilio';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/verify-and-signup
 * Body: { email: string; code: string; password: string }
 *
 * 1. Verifies the OTP with Twilio Verify.
 * 2. If approved, creates a Supabase account.
 *
 * The password is only sent to this endpoint AFTER the OTP is confirmed —
 * it is never persisted before the account is created.
 */
export async function POST(request: NextRequest) {
    try {
        const { email, code, password } = await request.json();

        // ── Input validation ─────────────────────────────────────────────────
        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
        }
        if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
            return NextResponse.json({ error: 'A valid 6-digit code is required.' }, { status: 400 });
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // ── Twilio OTP check ─────────────────────────────────────────────────
        const check = await checkVerificationCode(normalizedEmail, code);

        if (!check.success) {
            return NextResponse.json({ error: check.error }, { status: 502 });
        }
        if (!check.approved) {
            return NextResponse.json(
                { error: 'Incorrect or expired code. Please try again.' },
                { status: 400 },
            );
        }

        // ── Create Supabase account ──────────────────────────────────────────
        const supabase = await createClient();
        const { error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
                // Skip Supabase's own email confirmation — Twilio already verified
                emailRedirectTo: undefined,
            },
        });

        if (signUpError) {
            // Surface Supabase errors (e.g. "User already registered") clearly
            return NextResponse.json({ error: signUpError.message }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
}
