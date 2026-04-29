'use client';

import { ChevronRight, File } from 'lucide-react';

interface BreadcrumbProps {
    activePath: string | null;
}

export function Breadcrumb({ activePath }: BreadcrumbProps) {
    if (!activePath) return null;

    const segments = activePath.split('/');

    return (
        <div className="flex items-center gap-0.5 px-3 py-1 text-[13px] text-[#858585] bg-[#1e1e1e] border-b border-[#3e3e42] overflow-x-auto scrollbar-hide shrink-0">
            {segments.map((seg, i) => {
                const isLast = i === segments.length - 1;
                return (
                    <span key={i} className="flex items-center gap-0.5 shrink-0">
                        {i > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
                        <span
                            className={`flex items-center gap-1 px-0.5 rounded transition-colors ${
                                isLast
                                    ? 'text-[#d4d4d4]'
                                    : 'hover:text-[#d4d4d4] cursor-pointer'
                            }`}
                        >
                            {isLast && <File className="w-3.5 h-3.5 shrink-0" />}
                            {seg}
                        </span>
                    </span>
                );
            })}
        </div>
    );
}
