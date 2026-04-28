'use client';

import { useEffect, useRef, useState } from 'react';
import { Folder, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SimpleTooltip } from '@/components/ui';
import type { Project } from '@/types/projects';

interface ProjectsSectionProps {
    projects: Project[];
    activeProjectId: string | null;
    onCreateProject: () => void;
    onSelectProject: (id: string) => void;
    onRenameProject: (project: Project) => void;
    onDeleteProject: (project: Project) => void;
}

interface ProjectListItemProps {
    project: Project;
    isActive: boolean;
    onSelect: () => void;
    onRename: () => void;
    onDelete: () => void;
}

function ProjectListItem({ project, isActive, onSelect, onRename, onDelete }: ProjectListItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const openMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
        setMenuOpen((o) => !o);
    };

    return (
        <>
            <div
                className={cn(
                    'group relative flex items-center gap-2 pl-2 pr-1 h-8 rounded-md transition-colors duration-150 text-[13px] cursor-pointer',
                    isActive
                        ? 'bg-surface-3 text-foreground'
                        : 'text-foreground-muted hover:bg-surface-2 hover:text-foreground'
                )}
                onClick={onSelect}
            >
                <Folder className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                <span className="flex-1 min-w-0 truncate leading-none">{project.name}</span>

                <SimpleTooltip content="More options" side="top" disabled={menuOpen}>
                    <button
                        ref={btnRef}
                        onClick={openMenu}
                        aria-label="More options"
                        className={cn(
                            'shrink-0 h-6 w-6 flex items-center justify-center rounded transition-all',
                            menuOpen
                                ? 'bg-surface-3 text-foreground opacity-100'
                                : 'text-foreground-subtle hover:bg-surface-3 hover:text-foreground opacity-0 group-hover:opacity-100',
                            isActive && 'opacity-100'
                        )}
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                </SimpleTooltip>
            </div>

            {menuOpen && (
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                    className="min-w-[160px] bg-popover text-popover-foreground rounded-lg border border-border shadow-overlay py-1"
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); onRename(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                    </button>
                    <div className="my-1 h-px bg-border-subtle" />
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </button>
                </div>
            )}
        </>
    );
}

export function ProjectsSection({
    projects,
    activeProjectId,
    onCreateProject,
    onSelectProject,
    onRenameProject,
    onDeleteProject,
}: ProjectsSectionProps) {
    return (
        <div className="mb-3">
            {/* Section header — label + new project button (parallel to "Pinned") */}
            <div className="group flex items-center justify-between px-2 pb-1 pt-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
                    Projects
                </div>
                <SimpleTooltip content="New project" side="top">
                    <button
                        type="button"
                        onClick={onCreateProject}
                        aria-label="New project"
                        className="h-5 w-5 flex items-center justify-center rounded text-foreground-subtle hover:text-foreground hover:bg-surface-2 transition-colors"
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </button>
                </SimpleTooltip>
            </div>

            {projects.length === 0 ? (
                <button
                    type="button"
                    onClick={onCreateProject}
                    className="w-full text-left px-2 py-1 text-[12px] text-foreground-subtle hover:text-foreground transition-colors"
                >
                    No projects yet — create one
                </button>
            ) : (
                <div className="space-y-px">
                    {projects.map((project) => (
                        <ProjectListItem
                            key={project.id}
                            project={project}
                            isActive={activeProjectId === project.id}
                            onSelect={() => onSelectProject(project.id)}
                            onRename={() => onRenameProject(project)}
                            onDelete={() => onDeleteProject(project)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
