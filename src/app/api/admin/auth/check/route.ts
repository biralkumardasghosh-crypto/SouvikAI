import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from '@/lib/admin-auth';

export async function GET() {
    const cookieStore = await cookies();
    const session = cookieStore.get(ADMIN_COOKIE_NAME);

    if (await isAdminSessionValid(session?.value)) {
        return NextResponse.json({ authenticated: true });
    }

    return NextResponse.json({ authenticated: false }, { status: 401 });
}
