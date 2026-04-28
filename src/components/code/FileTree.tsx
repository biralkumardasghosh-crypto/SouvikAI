'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuilderFiles } from '@/types/code';

interface FileTreeProps {
    files: BuilderFiles;
    activeFile: string | null;
    onSelectFile: (path: string) => void;
}

interface TreeNode {
    name: string;
    path: string;
    isDir: boolean;
    children: TreeNode[];
}

/** Convert the flat path → contents map into a nested tree, sorted folders-first. */
function buildTree(files: BuilderFiles): TreeNode {
    const root: TreeNode = { name: '', path: '', isDir: true, children: [] };

    for (const fullPath of Object.keys(files).sort()) {
        const segments = fullPath.split('/');
        let cursor = root;

        segments.forEach((seg, idx) => {
            const isLeaf = idx === segments.length - 1;
            const childPath = segments.slice(0, idx + 1).join('/');
            let child = cursor.children.find((c) => c.name === seg);
            if (!child) {
                child = {
                    name: seg,
                    path: childPath,
                    isDir: !isLeaf,
                    children: [],
                };
                cursor.children.push(child);
            }
            cursor = child;
        });
    }

    sortNode(root);
    return root;
}

function sortNode(node: TreeNode) {
    node.children.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
}

export function FileTree({ files, activeFile, onSelectFile }: FileTreeProps) {
    const tree = useMemo(() => buildTree(files), [files]);

    return (
        <div className="text-[13px] text-foreground-muted py-2 select-none">
            {tree.children.map((child) => (
                <TreeRow
                    key={child.path}
                    node={child}
                    depth={0}
                    activeFile={activeFile}
                    onSelectFile={onSelectFile}
                />
            ))}
        </div>
    );
}

interface TreeRowProps {
    node: TreeNode;
    depth: number;
    activeFile: string | null;
    onSelectFile: (path: string) => void;
}

function TreeRow({ node, depth, activeFile, onSelectFile }: TreeRowProps) {
    const [open, setOpen] = useState(depth < 1);

    if (node.isDir) {
        return (
            <div>
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    style={{ paddingLeft: 8 + depth * 12 }}
                    className="w-full flex items-center gap-1.5 h-7 pr-2 hover:bg-surface-2 rounded text-foreground-muted hover:text-foreground transition-colors"
                >
                    <ChevronRight
                        className={cn(
                            'h-3 w-3 shrink-0 transition-transform',
                            open && 'rotate-90',
                        )}
                    />
                    {open ? (
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <Folder className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{node.name}</span>
                </button>
                {open && (
                    <div>
                        {node.children.map((child) => (
                            <TreeRow
                                key={child.path}
                                node={child}
                                depth={depth + 1}
                                activeFile={activeFile}
                                onSelectFile={onSelectFile}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const isActive = activeFile === node.path;
    return (
        <button
            type="button"
            onClick={() => onSelectFile(node.path)}
            style={{ paddingLeft: 8 + depth * 12 + 16 /* indent past the chevron column */ }}
            className={cn(
                'w-full flex items-center gap-1.5 h-7 pr-2 rounded transition-colors text-left',
                isActive
                    ? 'bg-surface-3 text-foreground'
                    : 'text-foreground-muted hover:bg-surface-2 hover:text-foreground',
            )}
        >
            <File className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
        </button>
    );
}
