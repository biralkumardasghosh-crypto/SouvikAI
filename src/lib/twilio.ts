/**
 * Twilio Verify helper — server-side only.
 *
 * Wraps the two Twilio Verify API calls used for email OTP:
 *   1. sendVerificationCode  — triggers a 6-digit code email to the user
 *   2. checkVerificationCode — validates the code the user entered
 *
 * Both functions return a typed result, never throw raw Twilio errors.
 */

import twilio from 'twilio';

// ─── Environment validation ───────────────────────────────────────────────────

const ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
const SERVICE_SID   = process.env.TWILIO_VERIFY_SERVICE_SID;

function getClient() {
    if (!ACCOUNT_SID || !AUTH_TOKEN || !SERVICE_SID) {
        throw new Error(
            'Twilio environment variables are not configured. ' +
            'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID.',
        );
    }
    return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface VerifyResult {
    success: boolean;
    error?: string;
}

export interface CheckResult {
    success: boolean;
    approved: boolean;
    error?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sends a 6-digit OTP to the given email address via Twilio Verify (email channel).
 * Re-calling this for the same email before expiry will re-send the code.
 */
export async function sendVerificationCode(email: string): Promise<VerifyResult> {
    try {
        const client = getClient();
        const verification = await client.verify.v2
            .services(SERVICE_SID!)
            .verifications.create({ to: email, channel: 'email' });

        if (verification.status === 'pending') {
            return { success: true };
        }

        return { success: false, error: 'Unexpected verification status: ' + verification.status };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send verification code.';
        console.error('[Twilio] sendVerificationCode error:', message);
        return { success: false, error: 'Could not send verification email. Please try again.' };
    }
}

/**
 * Checks the OTP code entered by the user.
 * Returns `approved: true` only if the code is correct and not expired.
 */
export async function checkVerificationCode(email: string, code: string): Promise<CheckResult> {
    try {
        const client = getClient();
        const check = await client.verify.v2
            .services(SERVICE_SID!)
            .verificationChecks.create({ to: email, code });

        const approved = check.status === 'approved';
        return { success: true, approved };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to verify code.';
        console.error('[Twilio] checkVerificationCode error:', message);
        return { success: false, approved: false, error: 'Could not verify code. Please try again.' };
    }
}
