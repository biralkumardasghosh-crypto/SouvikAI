/**
 * Admin authentication utilities.
 *
 * - Sessions are HMAC-SHA-256 signed tokens of the form `<payloadB64>.<sigB64>`,
 *   where payload is `{ u: username, iat, exp }` (JSON, base64url-encoded).
 * - All crypto uses the Web Crypto API (`crypto.subtle`) so this file is safe
 *   to import from Edge runtime (middleware) AND Node runtime (API routes).
 * - The signing secret is `ADMIN_SESSION_SECRET`. If unset, we fall back to
 *   `ADMIN_PASSWORD` so existing deployments don't break — but rotating the
 *   password will invalidate all live sessions, which is the right behaviour.
 * - Login rate-limiting is per-IP, in-memory (best effort across instances).
 */

export const ADMIN_COOKIE_NAME = 'admin_session';
export const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ── Secret resolution ────────────────────────────────────────────────────────

function getSessionSecret(): string | null {
    return (
        process.env.ADMIN_SESSION_SECRET ||
        process.env.ADMIN_PASSWORD ||
        null
    );
}

// ── base64url helpers (no Buffer — works on Edge) ────────────────────────────

function b64urlEncodeBytes(bytes: Uint8Array): string {
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeBytes(s: string): Uint8Array | null {
    try {
        let t = s.replace(/-/g, '+').replace(/_/g, '/');
        while (t.length % 4) t += '=';
        const bin = atob(t);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

// ── HMAC ─────────────────────────────────────────────────────────────────────

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    return new Uint8Array(sig);
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
    return r === 0;
}

// ── Session token issuing / verification ─────────────────────────────────────

export interface AdminSession {
    username: string;
    issuedAt: number;
    expiresAt: number;
}

export async function signAdminSession(username: string): Promise<string> {
    const secret = getSessionSecret();
    if (!secret) {
        throw new Error(
            'ADMIN_SESSION_SECRET (or ADMIN_PASSWORD) must be configured to sign admin sessions.'
        );
    }
    const now = Date.now();
    const payload = JSON.stringify({
        u: username,
        iat: now,
        exp: now + ADMIN_SESSION_TTL_MS,
    });
    const payloadB64 = b64urlEncodeBytes(new TextEncoder().encode(payload));
    const sig = await hmacSha256(secret, payloadB64);
    return `${payloadB64}.${b64urlEncodeBytes(sig)}`;
}

export async function verifyAdminSession(
    token: string | undefined | null
): Promise<AdminSession | null> {
    if (!token || typeof token !== 'string') return null;

    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) return null;

    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);

    const secret = getSessionSecret();
    if (!secret) return null;

    const expected = await hmacSha256(secret, payloadB64);
    const actual = b64urlDecodeBytes(sigB64);
    if (!actual) return null;
    if (!timingSafeEqualBytes(expected, actual)) return null;

    const payloadBytes = b64urlDecodeBytes(payloadB64);
    if (!payloadBytes) return null;

    let payload: { u?: unknown; iat?: unknown; exp?: unknown };
    try {
        payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch {
        return null;
    }

    if (
        typeof payload.u !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
    ) {
        return null;
    }
    if (Date.now() > payload.exp) return null;

    return { username: payload.u, issuedAt: payload.iat, expiresAt: payload.exp };
}

/** Convenience: returns true iff the cookie value carries a valid signed session. */
export async function isAdminSessionValid(
    cookieValue: string | undefined | null
): Promise<boolean> {
    return (await verifyAdminSession(cookieValue)) !== null;
}

// ── Password verification (timing-safe) ──────────────────────────────────────

export async function verifyAdminCredentials(
    username: string,
    password: string
): Promise<boolean> {
    const expectedUser = process.env.ADMIN_USERNAME;
    const expectedPass = process.env.ADMIN_PASSWORD;
    if (!expectedUser || !expectedPass) return false;
    if (typeof username !== 'string' || typeof password !== 'string') return false;

    // Hash both sides before comparing so the comparison length is constant
    // regardless of input length, avoiding length-leak side channels.
    const enc = new TextEncoder();
    const [uA, uB, pA, pB] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(username)),
        crypto.subtle.digest('SHA-256', enc.encode(expectedUser)),
        crypto.subtle.digest('SHA-256', enc.encode(password)),
        crypto.subtle.digest('SHA-256', enc.encode(expectedPass)),
    ]);
    const userOk = timingSafeEqualBytes(new Uint8Array(uA), new Uint8Array(uB));
    const passOk = timingSafeEqualBytes(new Uint8Array(pA), new Uint8Array(pB));
    // Avoid short-circuit so total time is independent of which field is wrong.
    return userOk && passOk;
}

// ── Login rate limiter (per-IP, in-memory) ───────────────────────────────────

interface Bucket {
    count: number;
    resetAt: number;
}

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, Bucket>();

export interface RateLimitResult {
    ok: boolean;
    /** Seconds until the bucket resets (only set when ok=false). */
    retryAfter?: number;
}

/**
 * Increments the attempt counter for `ip` and returns whether the request
 * may proceed. Call this BEFORE checking credentials — failed login attempts
 * count the same as successful ones, which is what protects against brute force.
 */
export function checkLoginRateLimit(ip: string): RateLimitResult {
    const now = Date.now();

    // Lazy GC so the map doesn't grow without bound on large attack surfaces.
    if (loginAttempts.size > 10_000) {
        loginAttempts.forEach((v, k) => {
            if (v.resetAt < now) loginAttempts.delete(k);
        });
    }

    const existing = loginAttempts.get(ip);
    if (!existing || existing.resetAt < now) {
        loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return { ok: true };
    }
    if (existing.count >= LOGIN_LIMIT) {
        return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
    }
    existing.count++;
    return { ok: true };
}

/** Best-effort client IP from common proxy headers, with a sane fallback. */
export function getClientIp(headers: Headers): string {
    const fwd = headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0]!.trim();
    return (
        headers.get('x-real-ip') ||
        headers.get('cf-connecting-ip') ||
        'unknown'
    );
}
