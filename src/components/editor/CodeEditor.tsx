'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { File } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Search, X, ChevronDown, ChevronUp, Replace } from 'lucide-react';

interface CodeEditorProps {
    path: string | null;
    value: string;
    onChange: (content: string) => void;
    onPositionChange?: (line: number, col: number) => void;
    scrollRef?: React.RefObject<HTMLDivElement | null>;
}

const LINE_HEIGHT = 19; // px — must match CSS
const FONT_SIZE = 13;
const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace";
const GUTTER_WIDTH = 56; // px

const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', html: 'html', css: 'css', scss: 'scss',
    json: 'json', md: 'markdown', sql: 'sql', sh: 'bash', yaml: 'yaml', yml: 'yaml',
    java: 'java', xml: 'xml', graphql: 'graphql',
};

export function CodeEditor({ path, value, onChange, onPositionChange, scrollRef }: CodeEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showFind, setShowFind] = useState(false);
    const [showReplace, setShowReplace] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [replaceValue, setReplaceValue] = useState('');
    const [matchIndex, setMatchIndex] = useState(0);
    const findInputRef = useRef<HTMLInputElement>(null);

    const language = useMemo(() => {
        if (!path) return 'plaintext';
        const ext = path.split('.').pop()?.toLowerCase() ?? '';
        return EXT_TO_LANG[ext] ?? 'plaintext';
    }, [path]);

    const lines = value.split('\n');

    // ── Cursor position tracking ────────────────────────────────────────────
    const handleSelect = useCallback(() => {
        const ta = textareaRef.current;
        if (!ta || !onPositionChange) return;
        const before = value.slice(0, ta.selectionStart);
        const linesBefore = before.split('\n');
        onPositionChange(linesBefore.length, linesBefore[linesBefore.length - 1].length + 1);
    }, [value, onPositionChange]);

    // ── Keyboard shortcuts ──────────────────────────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const ta = e.currentTarget;

        // Find
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            setShowFind(true);
            setTimeout(() => findInputRef.current?.focus(), 50);
            return;
        }

        // Tab — insert 2 spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const newVal = value.slice(0, start) + '  ' + value.slice(end);
            onChange(newVal);
            requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
            return;
        }

        // Auto-indent on Enter
        if (e.key === 'Enter') {
            e.preventDefault();
            const start = ta.selectionStart;
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const currentLine = value.slice(lineStart, start);
            const indent = currentLine.match(/^(\s*)/)?.[1] ?? '';
            const extra = /[{([<]$/.test(currentLine.trim()) ? '  ' : '';
            const ins = '\n' + indent + extra;
            const newVal = value.slice(0, start) + ins + value.slice(ta.selectionEnd);
            onChange(newVal);
            requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + ins.length; });
            return;
        }

        // Auto-close brackets/quotes
        const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
        if (pairs[e.key] && ta.selectionStart === ta.selectionEnd) {
            e.preventDefault();
            const start = ta.selectionStart;
            const ins = e.key + pairs[e.key];
            const newVal = value.slice(0, start) + ins + value.slice(start);
            onChange(newVal);
            requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
            return;
        }
    }, [value, onChange]);

    // ── Find & Replace ──────────────────────────────────────────────────────
    const matches = useMemo(() => {
        if (!findQuery) return [];
        const result: number[] = [];
        let idx = 0;
        const lower = value.toLowerCase();
        const query = findQuery.toLowerCase();
        while ((idx = lower.indexOf(query, idx)) !== -1) {
            result.push(idx);
            idx += query.length;
        }
        return result;
    }, [value, findQuery]);

    const jumpToMatch = useCallback((idx: number) => {
        const ta = textareaRef.current;
        if (!ta || matches.length === 0) return;
        const i = ((idx % matches.length) + matches.length) % matches.length;
        setMatchIndex(i);
        ta.focus();
        ta.setSelectionRange(matches[i], matches[i] + findQuery.length);
    }, [matches, findQuery]);

    const replaceNext = useCallback(() => {
        if (matches.length === 0) return;
        const pos = matches[matchIndex % matches.length];
        const newVal = value.slice(0, pos) + replaceValue + value.slice(pos + findQuery.length);
        onChange(newVal);
    }, [matches, matchIndex, value, findQuery, replaceValue, onChange]);

    const replaceAll = useCallback(() => {
        if (!findQuery) return;
        onChange(value.replaceAll(findQuery, replaceValue));
    }, [value, findQuery, replaceValue, onChange]);

    useEffect(() => {
        if (!showFind) { setFindQuery(''); setMatchIndex(0); }
    }, [showFind]);

    // ── Sync textarea scroll with external scroll container ─────────────────
    useEffect(() => {
        const container = scrollRef?.current;
        const ta = textareaRef.current;
        if (!container || !ta) return;
        const sync = () => { ta.scrollTop = container.scrollTop; };
        container.addEventListener('scroll', sync);
        return () => container.removeEventListener('scroll', sync);
    }, [scrollRef]);

    if (!path) {
        return (
            <div className="flex-1 flex items-center justify-center text-foreground-subtle text-[13px]">
                <div className="flex flex-col items-center gap-2">
                    <File className="h-5 w-5" />
                    <span>Select a file to start editing</span>
                </div>
            </div>
        );
    }

    const customStyle: React.CSSProperties = {
        margin: 0,
        padding: `12px 12px 12px ${GUTTER_WIDTH}px`,
        background: 'transparent',
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY,
        lineHeight: `${LINE_HEIGHT}px`,
        minHeight: '100%',
        whiteSpace: 'pre',
        overflowWrap: 'normal',
        wordBreak: 'normal',
        tabSize: 2,
    };

    const codeTagStyle: React.CSSProperties = {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: `${LINE_HEIGHT}px`,
        display: 'block',
    };

    return (
        <div className="flex flex-col h-full relative flex-1 min-h-0 bg-[#1e1e1e]">
            {/* Find / Replace bar */}
            {showFind && (
                <div className="absolute top-2 right-4 z-20 bg-[#252526] border border-[#3e3e42] rounded-lg shadow-xl p-2 w-80 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-[#858585] shrink-0" />
                        <input
                            ref={findInputRef}
                            value={findQuery}
                            onChange={e => { setFindQuery(e.target.value); setMatchIndex(0); }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') jumpToMatch(matchIndex + (e.shiftKey ? -1 : 1));
                                if (e.key === 'Escape') setShowFind(false);
                            }}
                            placeholder="Find"
                            className="flex-1 bg-[#3c3c3c] text-[#d4d4d4] text-[13px] px-2 py-1 rounded border border-[#3e3e42] outline-none focus:border-[#0078d4]"
                        />
                        <span className="text-[10px] text-[#858585] shrink-0">
                            {matches.length > 0 ? `${(matchIndex % matches.length) + 1}/${matches.length}` : '0/0'}
                        </span>
                        <button onClick={() => jumpToMatch(matchIndex - 1)} className="text-[#858585] hover:text-[#d4d4d4]">
                            <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => jumpToMatch(matchIndex + 1)} className="text-[#858585] hover:text-[#d4d4d4]">
                            <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setShowReplace(v => !v)} title="Toggle Replace" className="text-[#858585] hover:text-[#d4d4d4]">
                            <Replace className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setShowFind(false)} className="text-[#858585] hover:text-[#d4d4d4]">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {showReplace && (
                        <div className="flex items-center gap-2">
                            <div className="w-3.5" />
                            <input
                                value={replaceValue}
                                onChange={e => setReplaceValue(e.target.value)}
                                placeholder="Replace"
                                className="flex-1 bg-[#3c3c3c] text-[#d4d4d4] text-[13px] px-2 py-1 rounded border border-[#3e3e42] outline-none focus:border-[#0078d4]"
                            />
                            <button onClick={replaceNext} className="text-xs text-[#d4d4d4] bg-[#0078d4]/20 hover:bg-[#0078d4]/40 px-2 py-1 rounded transition-colors">
                                Replace
                            </button>
                            <button onClick={replaceAll} className="text-xs text-[#d4d4d4] bg-[#0078d4]/20 hover:bg-[#0078d4]/40 px-2 py-1 rounded transition-colors">
                                All
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Editor area */}
            <div className="flex-1 relative overflow-auto scrollbar-thin scrollbar-thumb-white/10" ref={scrollRef as React.RefObject<HTMLDivElement>}>
                {/* Line numbers gutter */}
                <div
                    className="absolute top-0 left-0 bottom-0 flex flex-col pt-3 pb-3 text-right pr-3 text-[#858585] text-[13px] select-none pointer-events-none z-10 bg-[#1e1e1e]"
                    style={{ width: GUTTER_WIDTH, fontFamily: FONT_FAMILY, lineHeight: `${LINE_HEIGHT}px` }}
                >
                    {lines.map((_, i) => (
                        <span key={i} className="leading-none" style={{ height: LINE_HEIGHT }}>{i + 1}</span>
                    ))}
                </div>

                {/* Highlighted code layer */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <SyntaxHighlighter
                        language={language}
                        style={vscDarkPlus}
                        customStyle={customStyle}
                        codeTagProps={{ style: codeTagStyle }}
                        wrapLongLines={false}
                        PreTag="div"
                    >
                        {value + '\n'}
                    </SyntaxHighlighter>
                </div>

                {/* Transparent textarea for input */}
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onSelect={handleSelect}
                    onClick={handleSelect}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    data-gramm="false"
                    className="absolute inset-0 resize-none outline-none caret-white text-transparent bg-transparent selection:bg-[#264f78]/60 z-[1]"
                    style={{
                        fontFamily: FONT_FAMILY,
                        fontSize: FONT_SIZE,
                        lineHeight: `${LINE_HEIGHT}px`,
                        padding: `12px 12px 12px ${GUTTER_WIDTH}px`,
                        whiteSpace: 'pre',
                        overflowWrap: 'normal',
                        wordBreak: 'normal',
                        tabSize: 2,
                        color: 'transparent',
                    }}
                />
            </div>
        </div>
    );
}
