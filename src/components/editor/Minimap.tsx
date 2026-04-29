'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MinimapProps {
    path: string | null;
    content: string;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    isVisible: boolean;
    onToggle: () => void;
}

const SCALE = 0.18;

const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', html: 'html', css: 'css', scss: 'scss',
    json: 'json', md: 'markdown', sql: 'sql', sh: 'bash', yaml: 'yaml', yml: 'yaml',
    java: 'java', xml: 'xml', graphql: 'graphql',
};

export function Minimap({ path, content, scrollContainerRef, isVisible, onToggle }: MinimapProps) {
    const minimapRef = useRef<HTMLDivElement>(null);
    const [viewportRect, setViewportRect] = useState({ top: 0, height: 0 });
    const isDragging = useRef(false);

    const language = useMemo(() => {
        if (!path) return 'plaintext';
        const ext = path.split('.').pop()?.toLowerCase() ?? '';
        return EXT_TO_LANG[ext] ?? 'plaintext';
    }, [path]);

    const updateViewport = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || !minimapRef.current) return;
        const ratio = minimapRef.current.clientHeight / container.scrollHeight || 1;
        setViewportRect({
            top: container.scrollTop * ratio * SCALE,
            height: container.clientHeight * ratio * SCALE,
        });
    }, [scrollContainerRef]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        container.addEventListener('scroll', updateViewport);
        updateViewport();
        return () => container.removeEventListener('scroll', updateViewport);
    }, [scrollContainerRef, updateViewport, content]);

    const handleMinimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const container = scrollContainerRef.current;
        const mm = minimapRef.current;
        if (!container || !mm) return;
        const rect = mm.getBoundingClientRect();
        const clickRatio = (e.clientY - rect.top) / rect.height;
        container.scrollTop = clickRatio * container.scrollHeight - container.clientHeight / 2;
    }, [scrollContainerRef]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;

        const handleMove = (me: MouseEvent) => {
            if (!isDragging.current) return;
            const container = scrollContainerRef.current;
            const mm = minimapRef.current;
            if (!container || !mm) return;
            const rect = mm.getBoundingClientRect();
            const ratio = (me.clientY - rect.top) / rect.height;
            container.scrollTop = Math.max(0, ratio * container.scrollHeight - container.clientHeight / 2);
        };

        const handleUp = () => { isDragging.current = false; };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp, { once: true });
    }, [scrollContainerRef]);

    if (!path) return null;

    return (
        <div className="flex flex-col border-l border-[#3e3e42] bg-[#1e1e1e]">
            {/* Toggle button */}
            <button
                onClick={onToggle}
                title={isVisible ? 'Hide Minimap' : 'Show Minimap'}
                className="flex items-center justify-center w-6 h-6 m-1 text-[#858585] hover:text-[#d4d4d4] rounded transition-colors"
            >
                <MapIcon className="w-3.5 h-3.5" />
            </button>

            {isVisible && (
                <div
                    ref={minimapRef}
                    className="relative flex-1 overflow-hidden cursor-pointer select-none"
                    style={{ width: 100 }}
                    onClick={handleMinimapClick}
                >
                    {/* Scaled code */}
                    <div
                        className="absolute top-0 left-0 origin-top-left pointer-events-none"
                        style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width: `${100 / SCALE}%` }}
                    >
                        <SyntaxHighlighter
                            language={language}
                            style={vscDarkPlus}
                            customStyle={{
                                margin: 0, padding: '12px 8px', background: 'transparent',
                                fontSize: 13, lineHeight: '19px', whiteSpace: 'pre',
                            }}
                            wrapLongLines={false}
                            PreTag="div"
                        >
                            {content + '\n'}
                        </SyntaxHighlighter>
                    </div>

                    {/* Viewport indicator */}
                    <div
                        className="absolute left-0 right-0 bg-white/[0.07] border border-white/10 rounded-sm cursor-ns-resize"
                        style={{ top: viewportRect.top, height: Math.max(viewportRect.height, 10) }}
                        onMouseDown={handleMouseDown}
                    />
                </div>
            )}
        </div>
    );
}
