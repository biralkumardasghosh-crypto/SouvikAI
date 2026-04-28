/**
 * Builder (Forge) workspace types.
 *
 * The Builder is a code-generation agent: it reasons about a request, emits
 * milestones describing its plan, and applies file-system actions to a virtual
 * project. State is persisted in Supabase (`builder_workspaces`,
 * `builder_files`, `builder_messages`) so projects survive across sessions and
 * devices. The client mirrors that state in memory while editing.
 */

/** A virtual project file system: path → file contents. */
export type BuilderFiles = Record<string, string>;

/** A single mutation the agent performs on the virtual file system. */
export type BuilderFileAction =
    | { kind: 'create'; path: string; content: string }
    | { kind: 'edit'; path: string; content: string }
    | { kind: 'delete'; path: string };

/**
 * A "step" rendered in the agent's vertical timeline. A step is either a
 * milestone label or a record of a file action that was just applied.
 */
export type BuilderStep =
    | { id: string; kind: 'milestone'; text: string; status: 'doing' | 'done' }
    | { id: string; kind: 'action'; action: BuilderFileAction; status: 'done' };

/** A single message in the builder conversation. */
export interface BuilderMessage {
    id: string;
    role: 'user' | 'assistant';
    /** User-visible prose. For assistant messages, this is the final summary. */
    content: string;
    /** Only populated for assistant messages. */
    steps?: BuilderStep[];
    /** True while the assistant is still streaming a response into this message. */
    isStreaming?: boolean;
    /** True if the request errored mid-stream. */
    errored?: boolean;
    createdAt: number;
}

/** Server-streamed event shape (NDJSON). */
export type BuilderStreamEvent =
    | { type: 'milestone'; text: string }
    | { type: 'action'; action: BuilderFileAction }
    | { type: 'text'; delta: string }
    | { type: 'error'; message: string }
    | { type: 'done' };

/** Persisted workspace loaded from Supabase. */
export interface BuilderWorkspace {
    id: string;
    title: string;
    files: BuilderFiles;
    messages: BuilderMessage[];
    activeFile: string | null;
    createdAt: number;
    updatedAt: number;
}

/** Lightweight summary used for listings (sidebar / workspaces page). */
export interface BuilderWorkspaceSummary {
    id: string;
    title: string;
    activeFile: string | null;
    createdAt: number;
    updatedAt: number;
}
