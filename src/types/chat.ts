export interface Message {
    id: string;
    sessionId: string;
    userId: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
}

export interface ChatSession {
    id: string;
    userId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    isPinned: boolean;
    isArchived: boolean;
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


