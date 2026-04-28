export class AppError extends Error {
    public readonly code: string;
    public readonly status: number;

    constructor(message: string, code: string = 'UNKNOWN_ERROR', status: number = 500) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.status = status;
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, 'AUTHENTICATION_ERROR', 401);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Access denied') {
        super(message, 'AUTHORIZATION_ERROR', 403);
        this.name = 'AuthorizationError';
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR', 400);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(message, 'NOT_FOUND', 404);
        this.name = 'NotFoundError';
    }
}

export function handleError(error: unknown): { message: string; code: string; status: number } {
    if (error instanceof AppError) {
        return {
            message: error.message,
            code: error.code,
            status: error.status,
        };
    }

    if (error instanceof Error) {
        return {
            message: error.message,
            code: 'UNKNOWN_ERROR',
            status: 500,
        };
    }

    return {
        message: 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
        status: 500,
    };
}
