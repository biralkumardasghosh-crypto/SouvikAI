'use client';

import { useEffect, useMemo, useRef } from 'react';
import { File } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeEditorProps {
    path: string | null;
    value: string;
    onChange: (next: string) => void;
}

/**
 * Lightweight monospace editor with a synchronised line-number gutter.
 *
 * We deliberately avoid pulling in a heavy editor (Monaco / CodeMirror) — the
 * Builder editor is for review + small tweaks. The agent does the heavy
 * lifting via the chat panel.
 */
export function CodeEditor({ path, value, onChange }: CodeEditorProps) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);

    const lineCount = useMemo(() => {
        // `\n` count + 1, but at least 1 line. An empty file still shows "1".
        if (!value) return 1;
        return value.split('\n').length;
    }, [value]);

    // Mirror textarea scroll into the gutter so line numbers stay aligned.
    useEffect(() => {
        const ta = taRef.current;
        const gutter = gutterRef.current;
        if (!ta || !gutter) return;
        const onScroll = () => {
            gutter.scrollTop = ta.scrollTop;
        };
        ta.addEventListener('scroll', onScroll, { passive: true });
        return () => ta.removeEventListener('scroll', onScroll);
    }, []);

    if (!path) {
        return (
            <div className="flex-1 flex items-center justify-center text-foreground-subtle text-sm">
                <div className="flex flex-col items-center gap-2">
                    <File className="h-5 w-5" />
                    <span>Select a file to start editing</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* File path header */}
            <div className="shrink-0 flex items-center gap-1.5 h-9 px-3 border-b border-border-subtle bg-surface text-[12px] text-foreground-muted">
                <File className="h-3.5 w-3.5" />
                <code className="font-mono">{path}</code>
            </div>

            {/* Body: gutter + textarea share a horizontal row, both flex column */}
            <div className="flex-1 min-h-0 flex">
                <div
                    ref={gutterRef}
                    aria-hidden
                    className={cn(
                        'shrink-0 select-none overflow-hidden bg-surface text-foreground-subtle',
                        'pt-3 pr-2 pl-3 text-right font-mono text-[12px] leading-[1.55]',
                        'border-r border-border-subtle',
                    )}
                    style={{ minWidth: 48 }}
                >
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i}>{i + 1}</div>
                    ))}
                </div>
                <textarea
                    ref={taRef}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn(
                        'flex-1 min-w-0 bg-background text-foreground',
                        'font-mono text-[12px] leading-[1.55] p-3',
                        'resize-none outline-none',
                        'whitespace-pre',
                    )}
                />
            </div>
        </div>
    );
}
