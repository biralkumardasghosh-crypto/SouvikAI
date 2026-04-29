import {
    Plus,
    Search,
    Image as ImageIcon,
    Grid2X2,
    Code2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Sidebar navigation registry. Split from the Sidebar component so adding,
 * reordering, or hiding an entry is a one-line config change rather than
 * a JSX edit.
 */

export type StickyNavAction = 'new-chat' | 'search';
export type ScrollableNavAction = 'images' | 'apps' | 'code';

export interface StickyNavItem {
    icon: LucideIcon;
    label: string;
    action: StickyNavAction;
    shortcut?: string;
}

export interface ScrollableNavItem {
    icon: LucideIcon;
    label: string;
    action: ScrollableNavAction;
    href: string | undefined;
}

/** Stays pinned above the scrollable chat list. */
export const STICKY_NAV_ITEMS: StickyNavItem[] = [
    { icon: Plus, label: 'New chat', action: 'new-chat' },
    { icon: Search, label: 'Search chats', action: 'search', shortcut: '⌘K' },
];

/** Lives inside the scrollable region — scrolls together with the chat list. */
export const SCROLLABLE_NAV_ITEMS: ScrollableNavItem[] = [
    { icon: ImageIcon, label: 'Images', action: 'images', href: undefined },
    { icon: Grid2X2,   label: 'Apps',   action: 'apps',   href: undefined },
    { icon: Code2,     label: 'Code',  action: 'code',  href: '/code' },
];
