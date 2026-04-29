import { NextRequest, NextResponse } from 'next/server';
import { sendVerificationCode } from '@/lib/twilio';

/**
 * POST /api/auth/send-verification
 * Body: { email: string }
 *
 * Sends a 6-digit OTP to the given email via Twilio Verify.
 * Does NOT create any Supabase account at this stage.
 */
export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json();

        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
        }

        // Basic email format check before hitting Twilio
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
        }

        const result = await sendVerificationCode(email.toLowerCase().trim());

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
}
