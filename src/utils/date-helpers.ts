import { format, formatDistanceToNow, isToday, startOfDay, endOfDay } from 'date-fns';

export function formatRelativeTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(d, { addSuffix: true });
}

export function formatChatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isToday(d)) {
        return format(d, 'h:mm a');
    }
    return format(d, 'MMM d, h:mm a');
}

export function getTodayRange(): { start: Date; end: Date } {
    const now = new Date();
    return {
        start: startOfDay(now),
        end: endOfDay(now),
    };
}

export function formatSuspensionDuration(hours: number): string {
    if (hours < 24) {
        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
}

export function getHourLabel(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}
