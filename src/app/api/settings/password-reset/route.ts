/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import twilioMail from '@sendgrid/mail';

const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
const TWILIO_FROM = process.env.TWILIO_FROM_EMAIL || 'noreply@yourdomain.com';

if (TWILIO_API_KEY) {
    twilioMail.setApiKey(TWILIO_API_KEY);
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Authenticate user from session
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Generate secure admin recovery link
        // We need the service role key to generate links without tracking the email state
        const supabaseAdmin = (await import('@supabase/supabase-js')).createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const rootUrl = new URL(req.url).origin;
        const redirectTo = `${rootUrl}/update-password`;

        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: user.email!,
            options: {
                redirectTo,
            }
        });

        if (linkError || !linkData?.properties?.action_link) {
            console.error('[Settings/Password-Reset] Failed to generate recovery link:', linkError);
            return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
        }

        const recoveryUrl = linkData.properties.action_link;

        // 3. Dispatch the email via Twilio
        if (!TWILIO_API_KEY) {
            console.error('[Settings/Password-Reset] TWILIO_API_KEY is not configured in .env.local');
            return NextResponse.json({ error: 'Email service is not configured' }, { status: 503 });
        }

        const msg = {
            to: user.email!,
            from: TWILIO_FROM,
            subject: 'Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h2 style="color: #000;">Password Reset Request</h2>
                    <p>Hello,</p>
                    <p>We received a request to change your password limit. If you didn't make this request, you can safely ignore this email.</p>
                    <p>Otherwise, click the secure link below to reset your password:</p>
                    <div style="margin: 30px 0;">
                        <a href="${recoveryUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Reset Password</a>
                    </div>
                    <p style="font-size: 12px; color: #666; margin-top: 40px; border-top: 1px solid #eaeaea; padding-top: 20px;">
                        This link will expire soon. For security reasons, do not share this email.
                    </p>
                </div>
            `,
        };

        await twilioMail.send(msg);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[Settings/Password-Reset] Unhandled exception:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
