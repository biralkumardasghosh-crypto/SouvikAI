export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    email: string;
                    created_at: string;
                    suspended_until: string | null;
                    suspension_reason: string | null;
                    is_deleted: boolean;
                    deletion_reason: string | null;
                    is_kicked: boolean;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    email: string;
                    created_at?: string;
                    suspended_until?: string | null;
                    suspension_reason?: string | null;
                    is_deleted?: boolean;
                    deletion_reason?: string | null;
                    is_kicked?: boolean;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    email?: string;
                    created_at?: string;
                    suspended_until?: string | null;
                    suspension_reason?: string | null;
                    is_deleted?: boolean;
                    deletion_reason?: string | null;
                    is_kicked?: boolean;
                    updated_at?: string;
                };
            };
            chat_sessions: {
                Row: {
                    id: string;
                    user_id: string;
                    title: string;
                    created_at: string;
                    updated_at: string;
                    project_id: string | null;
                    branched_from_session_id: string | null;
                    branched_from_title: string | null;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    title?: string;
                    created_at?: string;
                    updated_at?: string;
                    project_id?: string | null;
                    branched_from_session_id?: string | null;
                    branched_from_title?: string | null;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    title?: string;
                    created_at?: string;
                    updated_at?: string;
                    project_id?: string | null;
                    branched_from_session_id?: string | null;
                    branched_from_title?: string | null;
                };
            };
            projects: {
                Row: {
                    id: string;
                    user_id: string;
                    name: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    name: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    name?: string;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            chat_messages: {
                Row: {
                    id: string;
                    session_id: string;
                    user_id: string;
                    role: 'user' | 'assistant';
                    content: string;
                    created_at: string;
                    attachments: unknown | null;
                };
                Insert: {
                    id?: string;
                    session_id: string;
                    user_id: string;
                    role: 'user' | 'assistant';
                    content: string;
                    created_at?: string;
                    attachments?: unknown | null;
                };
                Update: {
                    id?: string;
                    session_id?: string;
                    user_id?: string;
                    role?: 'user' | 'assistant';
                    content?: string;
                    created_at?: string;
                    attachments?: unknown | null;
                };
            };
            requests_log: {
                Row: {
                    id: string;
                    user_id: string;
                    created_at: string;
                    status: 'completed' | 'failed' | 'aborted';
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    created_at?: string;
                    status?: 'completed' | 'failed' | 'aborted';
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    created_at?: string;
                    status?: 'completed' | 'failed' | 'aborted';
                };
            };
            admin_settings: {
                Row: {
                    id: number;
                    temperature: number;
                    max_tokens: number;
                    model_name: string;
                    edit_mode: boolean;
                    updated_at: string;
                };
                Insert: {
                    id?: number;
                    temperature?: number;
                    max_tokens?: number;
                    model_name?: string;
                    edit_mode?: boolean;
                    updated_at?: string;
                };
                Update: {
                    id?: number;
                    temperature?: number;
                    max_tokens?: number;
                    model_name?: string;
                    edit_mode?: boolean;
                    updated_at?: string;
                };
            };
        };
    };
}
