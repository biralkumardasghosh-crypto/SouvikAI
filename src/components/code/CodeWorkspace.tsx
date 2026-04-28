'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, SimpleTooltip } from '@/components/ui';
import { BuilderChatPanel } from './BuilderChatPanel';
import { CodeEditor } from './CodeEditor';
import { CodePreview } from './CodePreview';
import { FileTree } from './FileTree';
import { ViewToggle, type WorkspaceView } from './ViewToggle';
import type { BuilderFiles, BuilderMessage } from '@/types/code';
import type { AIModel } from '@/types/chat';

interface CodeWorkspaceProps {
    title: string;
    files: BuilderFiles;
    activeFile: string | null;
    messages: BuilderMessage[];
    isStreaming: boolean;
    error: string | null;
    models: AIModel[];
    selectedModelId: string;
    onModelChange: (id: string) => void;
    onSelectFile: (path: string) => void;
    onUpdateFile: (path: string, content: string) => void;
    onSend: (text: string) => void;
    onStop: () => void;
}

/**
 * Two-column Builder layout:
 *
 *   [ chat panel  ] | [ editor ⇄ preview ]
 *      ~ 380 px        flex-1
 *
 * The right pane swaps between the file editor and the live preview via
 * {@link ViewToggle}. On mobile the layout collapses to a single column with
 * a tab bar at the top to switch between chat / editor / preview.
 */
export function CodeWorkspace(props: CodeWorkspaceProps) {
    const [view, setView] = useState<WorkspaceView>('editor');
    const [mobileTab, setMobileTab] = useState<'chat' | 'right'>('chat');

    const activeContent =
        props.activeFile != null ? props.files[props.activeFile] ?? '' : '';

    return (
        <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
            {/* Top header — small, with home link + project title */}
            <header className="shrink-0 flex items-center gap-3 h-11 px-3 border-b border-border-subtle bg-background">
                <SimpleTooltip content="Back" side="bottom">
                    <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-foreground-muted hover:text-foreground"
                    >
                        <Link href="/code" aria-label="Back to Builder home">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                </SimpleTooltip>
                <div className="text-[13px] font-medium text-foreground truncate">
                    {props.title}
                </div>
                <div className="flex-1" />

                {/* Mobile-only segmented switch */}
                <div className="md:hidden inline-flex items-center rounded-lg bg-surface-2 p-0.5 border border-border-subtle">
                    <button
                        onClick={() => setMobileTab('chat')}
                        className={cn(
                            'h-7 px-2.5 rounded-md text-[12px] font-medium',
                            mobileTab === 'chat'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-foreground-muted',
                        )}
                    >
                        Chat
                    </button>
                    <button
                        onClick={() => setMobileTab('right')}
                        className={cn(
                            'h-7 px-2.5 rounded-md text-[12px] font-medium',
                            mobileTab === 'right'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-foreground-muted',
                        )}
                    >
                        Code
                    </button>
                </div>
            </header>

            <div className="flex-1 min-h-0 flex">
                {/* ── LEFT: chat panel ── */}
                <aside
                    className={cn(
                        'border-r border-border-subtle bg-background flex flex-col min-h-0',
                        // On mobile, take the whole row when chat tab is active.
                        mobileTab === 'chat' ? 'flex' : 'hidden',
                        'md:flex md:w-[380px] md:shrink-0',
                    )}
                >
                    <BuilderChatPanel
                        messages={props.messages}
                        isStreaming={props.isStreaming}
                        error={props.error}
                        models={props.models}
                        selectedModelId={props.selectedModelId}
                        onModelChange={props.onModelChange}
                        onSend={props.onSend}
                        onStop={props.onStop}
                    />
                </aside>

                {/* ── RIGHT: editor / preview ── */}
                <section
                    className={cn(
                        'flex-1 min-w-0 flex flex-col bg-background',
                        mobileTab === 'right' ? 'flex' : 'hidden',
                        'md:flex',
                    )}
                >
                    <div className="shrink-0 flex items-center justify-between gap-2 h-11 px-3 border-b border-border-subtle bg-background">
                        <ViewToggle value={view} onChange={setView} />
                        <span className="text-[11px] text-foreground-subtle">
                            {Object.keys(props.files).length} files
                        </span>
                    </div>

                    {view === 'editor' ? (
                        <div className="flex-1 min-h-0 flex">
                            <div className="w-[220px] shrink-0 border-r border-border-subtle bg-surface overflow-y-auto">
                                <FileTree
                                    files={props.files}
                                    activeFile={props.activeFile}
                                    onSelectFile={props.onSelectFile}
                                />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col">
                                <CodeEditor
                                    path={props.activeFile}
                                    value={activeContent}
                                    onChange={(next) =>
                                        props.activeFile && props.onUpdateFile(props.activeFile, next)
                                    }
                                />
                            </div>
                        </div>
                    ) : (
                        <CodePreview files={props.files} />
                    )}
                </section>
            </div>
        </div>
    );
}
