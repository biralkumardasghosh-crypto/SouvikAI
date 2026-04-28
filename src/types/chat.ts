export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
    favicon: string;
}

export interface WebSearchState {
    query: string;
    /** 'searching' while the server is fetching; 'done' once results arrive. */
    status: 'searching' | 'done';
    results: WebSearchResult[];
}

import type { MessageAttachment } from './attachments';

export interface Message {
    id: string;
    sessionId: string;
    userId: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
    /** Present on assistant messages when the searchWeb tool was used. */
    webSearch?: WebSearchState;
    /** Present on user messages with files attached — used to render previews in the bubble. */
    attachments?: MessageAttachment[];
}

export interface ChatSession {
    id: string;
    userId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    isPinned: boolean;
    isArchived: boolean;
    /** Optional project this chat belongs to. NULL = loose chat (top-level). */
    projectId: string | null;
    /** When this chat was created via "Branch", the id of the source chat. */
    branchedFromSessionId: string | null;
    /**
     * Snapshot of the source chat's title at the time of branching. Used to
     * render the "Branched from <title>" divider; persists even if the
     * source chat is later renamed or deleted.
     */
    branchedFromTitle: string | null;
}

export interface ChatState {
    messages: Message[];
    isLoading: boolean;
    error: string | null;
    currentSessionId: string | null;
}

export interface SendMessagePayload {
    sessionId: string;
    content: string;
}

export interface AIModel {
    id: string;
    name: string;
    displayName: string;
    quota_limit: number;
    is_suspended: boolean;
}


