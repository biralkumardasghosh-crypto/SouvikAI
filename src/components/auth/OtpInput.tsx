'use client';

import { useRef, KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
    value: string;           // always 6 chars (padded with '' internally)
    onChange: (val: string) => void;
    disabled?: boolean;
    hasError?: boolean;
}

const LENGTH = 6;

/**
 * Six individual single-character boxes that behave like a unified OTP field.
 * - Typing moves focus right automatically.
 * - Backspace clears the current box and moves focus left.
 * - Pasting a 6-digit string fills all boxes at once.
 */
export function OtpInput({ value, onChange, disabled, hasError }: OtpInputProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const digits = value.split('').concat(Array(LENGTH).fill('')).slice(0, LENGTH);

    const focus = (index: number) => {
        const clamped = Math.max(0, Math.min(LENGTH - 1, index));
        inputRefs.current[clamped]?.focus();
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>, index: number) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (!raw) return;

        const char = raw[raw.length - 1]; // only last digit if multiple typed
        const newDigits = [...digits];
        newDigits[index] = char;
        onChange(newDigits.join(''));

        if (index < LENGTH - 1) focus(index + 1);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            const newDigits = [...digits];
            if (newDigits[index]) {
                // clear current box
                newDigits[index] = '';
                onChange(newDigits.join(''));
            } else {
                // move back and clear
                newDigits[Math.max(0, index - 1)] = '';
                onChange(newDigits.join(''));
                focus(index - 1);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focus(index - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            focus(index + 1);
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
        if (pasted) {
            const newDigits = pasted.split('').concat(Array(LENGTH).fill('')).slice(0, LENGTH);
            onChange(newDigits.join(''));
            focus(Math.min(pasted.length, LENGTH - 1));
        }
    };

    return (
        <div className="flex gap-2 justify-center" role="group" aria-label="One-time password">
            {digits.map((digit, i) => (
                <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    disabled={disabled}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${i + 1}`}
                    onChange={(e) => handleChange(e, i)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    className={cn(
                        'w-11 h-13 text-center text-xl font-semibold rounded-xl border bg-background/50',
                        'transition-all duration-150 outline-none',
                        'focus:ring-2 focus:ring-primary/60 focus:border-primary',
                        hasError
                            ? 'border-destructive/70 bg-destructive/5 text-destructive'
                            : 'border-input/60 text-foreground',
                        disabled && 'opacity-50 cursor-not-allowed',
                    )}
                    style={{ height: '3.25rem' }}
                />
            ))}
        </div>
    );
}
