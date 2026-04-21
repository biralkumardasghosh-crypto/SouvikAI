export interface User {
    id: string;
    email: string;
    displayName?: string;
    createdAt: Date;
    suspendedUntil: Date | null;
    suspensionReason: string | null;
    isDeleted: boolean;
    deletionReason: string | null;
    isKicked: boolean;
}

export interface AuthState {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
}

export interface SignInCredentials {
    email: string;
    password: string;
}

export interface SignUpCredentials {
    email: string;
    password: string;
    confirmPassword: string;
}

export interface AdminSession {
    isAuthenticated: boolean;
    username: string;
}
