import { NextResponse } from 'next/server';

export interface ApiError {
    error: string;
    code?: string;
    status: number;
}

export function successResponse<T>(data: T, status: number = 200): NextResponse {
    return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status: number = 400, code?: string): NextResponse {
    return NextResponse.json({ error: message, code }, { status });
}

export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
    return errorResponse(message, 401, 'UNAUTHORIZED');
}

export function forbiddenResponse(message: string = 'Forbidden'): NextResponse {
    return errorResponse(message, 403, 'FORBIDDEN');
}

export function notFoundResponse(message: string = 'Not found'): NextResponse {
    return errorResponse(message, 404, 'NOT_FOUND');
}

export function serviceUnavailableResponse(
    message: string = 'We are currently updating our services, try again later.'
): NextResponse {
    return errorResponse(message, 503, 'SERVICE_UNAVAILABLE');
}

export function kickedResponse(): NextResponse {
    return errorResponse('You have been kicked out of the model quota.', 403, 'KICKED');
}

export function suspendedResponse(until: Date, reason: string): NextResponse {
    return NextResponse.json(
        {
            error: 'Your account is suspended',
            code: 'SUSPENDED',
            until: until.toISOString(),
            reason,
        },
        { status: 403 }
    );
}
