'use client';

/**
 * Lightweight toast system — no external deps, fully themed.
 *
 * Mounted once at the root via <ToastProvider>; consumers pull `toast()` /
 * `dismiss()` from the `useToast()` hook. Each toast supports an optional
 * `action` (rendered as a primary button — used for "Undo") and an
 * auto-dismiss `duration` (set to 0 to keep it pinned).
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface ToastOptions {
    title?: string;
    description?: string;
    variant?: ToastVariant;
    action?: { label: string; onClick: () => void };
    /** Milliseconds before auto-dismiss. Set to 0 to disable. Default 5000. */
    duration?: number;
}

interface ToastEntry extends ToastOptions {
    id: string;
}

interface ToastContextValue {
    toast: (opts: ToastOptions) => string;
    dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within a <ToastProvider>');
    }
    return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastEntry[]>([]);
    const timersRef = useRef<Map<string, number>>(new Map());

    const dismiss = useCallback((id: string) => {
        const timer = timersRef.current.get(id);
        if (timer) {
            window.clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback(
        (opts: ToastOptions) => {
            const id =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;

            const duration = opts.duration ?? 5000;
            setToasts((prev) => [...prev, { ...opts, id }]);

            if (duration > 0) {
                const timer = window.setTimeout(() => {
                    timersRef.current.delete(id);
                    setToasts((prev) => prev.filter((t) => t.id !== id));
                }, duration);
                timersRef.current.set(id, timer);
            }

            return id;
        },
        []
    );

    // Clear timers on unmount
    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach((t) => window.clearTimeout(t));
            timers.clear();
        };
    }, []);

    const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

// ── Viewport / item rendering ──────────────────────────────────────────────

function ToastViewport({
    toasts,
    onDismiss,
}: {
    toasts: ToastEntry[];
    onDismiss: (id: string) => void;
}) {
    return (
        <div
            className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
            aria-live="polite"
            role="region"
        >
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

const VARIANT_STYLES: Record<ToastVariant, { ring: string; iconClass: string; Icon: typeof Info | null }> = {
    default: { ring: 'border-white/10', iconClass: 'text-foreground/70', Icon: null },
    success: { ring: 'border-emerald-500/30', iconClass: 'text-emerald-400', Icon: CheckCircle2 },
    error: { ring: 'border-red-500/30', iconClass: 'text-red-400', Icon: AlertTriangle },
    warning: { ring: 'border-amber-500/30', iconClass: 'text-amber-400', Icon: AlertTriangle },
};

function ToastItem({
    toast: t,
    onDismiss,
}: {
    toast: ToastEntry;
    onDismiss: (id: string) => void;
}) {
    const variant = t.variant ?? 'default';
    const { ring, iconClass, Icon } = VARIANT_STYLES[variant];

    return (
        <div
            role="status"
            className={cn(
                'pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl',
                'bg-[#2a2a2a]/95 backdrop-blur-md text-foreground animate-slideUp',
                ring
            )}
        >
            {Icon && (
                <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', iconClass)} aria-hidden="true" />
            )}

            <div className="flex-1 min-w-0">
                {t.title && (
                    <p className="text-[13px] font-medium leading-snug text-foreground">
                        {t.title}
                    </p>
                )}
                {t.description && (
                    <p className="text-[12px] leading-snug text-muted-foreground mt-0.5 break-words">
                        {t.description}
                    </p>
                )}
            </div>

            {t.action && (
                <button
                    onClick={() => {
                        t.action!.onClick();
                        onDismiss(t.id);
                    }}
                    className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors"
                >
                    {t.action.label}
                </button>
            )}

            <button
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 -mr-1 mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
