'use client';

import { GitBranch, Check, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

interface StatusBarProps {
    activePath: string | null;
    line: number;
    col: number;
    isSaving: boolean;
}

const EXT_TO_LANG: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React',
    py: 'Python', rs: 'Rust', go: 'Go', html: 'HTML', css: 'CSS', scss: 'SCSS',
    json: 'JSON', md: 'Markdown', sql: 'SQL', sh: 'Shell', yaml: 'YAML', yml: 'YAML',
    java: 'Java', xml: 'XML', graphql: 'GraphQL',
};

export function StatusBar({ activePath, line, col, isSaving }: StatusBarProps) {
    const displayLang = useMemo(() => {
        if (!activePath) return 'Plaintext';
        const ext = activePath.split('.').pop()?.toLowerCase() ?? '';
        return EXT_TO_LANG[ext] ?? 'Plaintext';
    }, [activePath]);

    return (
        <div className="flex items-center justify-between px-3 h-[22px] bg-[#0078d4] text-white text-[11px] shrink-0 select-none">
            {/* Left section */}
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 opacity-90">
                    <GitBranch className="w-3 h-3" />
                    main
                </span>

                {isSaving && (
                    <span className="flex items-center gap-1 text-white/80">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving…
                    </span>
                )}
                {!isSaving && activePath && (
                    <span className="flex items-center gap-1 text-white/80">
                        <Check className="w-3 h-3" />
                        Saved
                    </span>
                )}
            </div>

            {/* Right section */}
            <div className="flex items-center gap-4 opacity-90">
                {activePath && (
                    <>
                        <span>Ln {line}, Col {col}</span>
                        <span>Spaces: 2</span>
                        <span>UTF-8</span>
                        <span>LF</span>
                        <span className="font-medium">{displayLang}</span>
                    </>
                )}
            </div>
        </div>
    );
}
