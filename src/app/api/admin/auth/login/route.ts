import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
    ADMIN_COOKIE_NAME,
    ADMIN_SESSION_TTL_MS,
    checkLoginRateLimit,
    getClientIp,
    signAdminSession,
    verifyAdminCredentials,
} from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
    try {
        // ── Rate limit per IP — protects against credential brute-forcing ────
        const ip = getClientIp(request.headers);
        const rl = checkLoginRateLimit(ip);
        if (!rl.ok) {
            return NextResponse.json(
                { error: 'Too many login attempts. Please try again later.' },
                {
                    status: 429,
                    headers: rl.retryAfter
                        ? { 'Retry-After': String(rl.retryAfter) }
                        : undefined,
                }
            );
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }
        const { username, password } = body as {
            username?: unknown;
            password?: unknown;
        };

        if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
            return NextResponse.json(
                { error: 'Admin credentials not configured' },
                { status: 500 }
            );
        }

        if (typeof username !== 'string' || typeof password !== 'string') {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Constant-time credential check.
        const ok = await verifyAdminCredentials(username, password);
        if (!ok) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Issue a signed session token. Throws if no signing secret is set.
        let token: string;
        try {
            token = await signAdminSession(username);
        } catch (err) {
            console.error('[admin/login] failed to sign session:', err);
            return NextResponse.json(
                { error: 'Server misconfiguration: missing session secret.' },
                { status: 500 }
            );
        }

        const cookieStore = await cookies();
        cookieStore.set(ADMIN_COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
            path: '/',
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[admin/login] unexpected error:', err);
        return NextResponse.json({ error: 'Failed to login' }, { status: 500 });
    }
}
