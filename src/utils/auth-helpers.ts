import { User } from '@/types/auth';

export function isUserSuspended(user: User): boolean {
    if (!user.suspendedUntil) return false;
    return new Date(user.suspendedUntil) > new Date();
}

export function isUserActive(user: User): boolean {
    return !user.isDeleted && !user.isKicked && !isUserSuspended(user);
}

export function getUserStatusLabel(user: User): string {
    if (user.isDeleted) return 'Deleted';
    if (user.isKicked) return 'Kicked';
    if (isUserSuspended(user)) return 'Suspended';
    return 'Active';
}

export function getUserStatusColor(user: User): string {
    if (user.isDeleted) return 'text-red-500';
    if (user.isKicked) return 'text-orange-500';
    if (isUserSuspended(user)) return 'text-yellow-500';
    return 'text-green-500';
}

export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export function validatePassword(password: string): { valid: boolean; message: string } {
    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    return { valid: true, message: '' };
}
