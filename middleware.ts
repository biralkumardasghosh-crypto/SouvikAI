import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Admin routes protection
    if (pathname.startsWith('/admin') && !pathname.startsWith('/adminlogin')) {
        const adminSession = request.cookies.get('admin_session');
        if (!adminSession?.value) {
            return NextResponse.redirect(new URL('/adminlogin', request.url));
        }
    }

    // Auth routes - redirect authenticated users to chat
    if (pathname === '/signin' || pathname === '/signup' || pathname === '/verify-email') {
        const { user } = await updateSession(request);
        if (user) {
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    // Protected chat route
    if (pathname === '/') {
        const { response, user } = await updateSession(request);
        if (!user) {
            return NextResponse.redirect(new URL('/signin', request.url));
        }
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/',
        '/signin',
        '/signup',
        '/verify-email',
        '/admin/:path*',
    ],
};
