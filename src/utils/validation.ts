export function validateRequired(value: string, fieldName: string): string | null {
    if (!value || value.trim() === '') {
        return `${fieldName} is required`;
    }
    return null;
}

export function validateMinLength(value: string, minLength: number, fieldName: string): string | null {
    if (value.length < minLength) {
        return `${fieldName} must be at least ${minLength} characters`;
    }
    return null;
}

export function validateMaxLength(value: string, maxLength: number, fieldName: string): string | null {
    if (value.length > maxLength) {
        return `${fieldName} must be at most ${maxLength} characters`;
    }
    return null;
}

export function validateNumberRange(
    value: number,
    min: number,
    max: number,
    fieldName: string
): string | null {
    if (value < min || value > max) {
        return `${fieldName} must be between ${min} and ${max}`;
    }
    return null;
}

export function validatePasswordMatch(password: string, confirmPassword: string): string | null {
    if (password !== confirmPassword) {
        return 'Passwords do not match';
    }
    return null;
}
