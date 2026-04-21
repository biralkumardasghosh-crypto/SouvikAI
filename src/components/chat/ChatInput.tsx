'use client';

import { useState, useRef, useEffect } from 'react';
import { Button, Textarea } from '@/components/ui';
import { useChatPreferences } from '@/hooks/useChatPreferences';
import { useAttachments } from '@/hooks/useAttachments';
import { AttachmentChip } from './AttachmentChip';
import { IMAGE_ACCEPT, DOCUMENT_ACCEPT } from '@/utils/attachments';
import { ArrowUp, Square, Plus, Mic, Paperclip, ImagePlus, Lightbulb, Globe, MoreHorizontal, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/types/attachments';

interface ChatInputProps {
    onSend: (message: string, attachments: Attachment[]) => void;
    onStop?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    /** Pre-fills the textarea (e.g. from a prompt suggestion click). */
    pendingMessage?: string;
    onPendingMessageConsumed?: () => void;
}

export function ChatInput({ onSend, onStop, isLoading, disabled, pendingMessage, onPendingMessageConsumed }: ChatInputProps) {
    const [message, setMessage]             = useState('');
    const [dropdownOpen, setDropdownOpen]   = useState(false);
    const textareaRef   = useRef<HTMLTextAreaElement>(null);
    const dropdownRef   = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const docInputRef   = useRef<HTMLInputElement>(null);

    const { preferences } = useChatPreferences();
    const { attachments, isProcessing, processingError, addFiles, removeAttachment, clearAttachments } = useAttachments();

    // Apply a pending suggestion from the parent
    useEffect(() => {
        if (pendingMessage) {
            setMessage(pendingMessage);
            setTimeout(() => textareaRef.current?.focus(), 50);
            onPendingMessageConsumed?.();
        }
    }, [pendingMessage, onPendingMessageConsumed]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [message]);

    // Close dropdown on outside click
    useEffect(() => {
        if (!dropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [dropdownOpen]);

    const handleSubmit = () => {
        if (message.trim() && !isLoading && !disabled && !isProcessing) {
            onSend(message.trim(), attachments);
            setMessage('');
            clearAttachments();
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (preferences.submitBehavior === 'enter') {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        } else if (preferences.submitBehavior === 'shift-enter') {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
            }
        }
    };

    const canSend = message.trim() && !isLoading && !disabled && !isProcessing;

    return (
        <div className="px-4 pb-4 md:pb-6 pt-2 bg-transparent">
            <div className="max-w-full md:max-w-3xl mx-auto">
                <div className="relative flex flex-col bg-[#2f2f2f] rounded-[26px] border border-white/5 hover:border-white/10 focus-within:border-white/10 transition-all shadow-sm">

                    {/* ── Attachment chips ────────────────────────────────────── */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
                            {attachments.map((a) => (
                                <AttachmentChip key={a.id} attachment={a} onRemove={removeAttachment} />
                            ))}
                        </div>
                    )}

                    {/* ── Processing error ────────────────────────────────────── */}
                    {processingError && (
                        <p className="text-[11px] text-red-400 px-4 pt-2">{processingError}</p>
                    )}

                    {/* ── Input row ───────────────────────────────────────────── */}
                    <div className="flex items-end px-2 py-2">
                        {/* Plus / attach button + dropdown */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setDropdownOpen((o) => !o)}
                                disabled={isLoading || disabled}
                                className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors ml-0.5 mb-0.5"
                                title="Add attachment"
                            >
                                <Plus className="h-5 w-5" />
                            </button>

                            {dropdownOpen && (
                                <div className="absolute bottom-full left-0 mb-2 w-[200px] bg-[#1e1e1e] rounded-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.5)] py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">

                                    {/* 1 — Add photos & files */}
                                    <button
                                        onClick={() => { imageInputRef.current?.click(); setDropdownOpen(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-white hover:bg-white/[0.07] transition-colors"
                                    >
                                        <Paperclip className="h-[15px] w-[15px] shrink-0" />
                                        Add photos &amp; files
                                    </button>

                                    {/* 2 — Create image (coming soon) */}
                                    <button
                                        disabled
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-white/60 cursor-not-allowed"
                                        title="Coming soon"
                                    >
                                        <ImagePlus className="h-[15px] w-[15px] shrink-0" />
                                        Create image
                                    </button>

                                    {/* 3 — Thinking (coming soon) */}
                                    <button
                                        disabled
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-white/60 cursor-not-allowed"
                                        title="Coming soon"
                                    >
                                        <Lightbulb className="h-[15px] w-[15px] shrink-0" />
                                        Thinking
                                    </button>

                                    {/* 4 — Deep research (coming soon) */}
                                    <button
                                        disabled
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-white/60 cursor-not-allowed"
                                        title="Coming soon"
                                    >
                                        <Globe className="h-[15px] w-[15px] shrink-0" />
                                        Deep research
                                    </button>

                                    <div className="my-1 h-px bg-white/[0.08] mx-2" />

                                    {/* 5 — More */}
                                    <button
                                        disabled
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-white/60 cursor-not-allowed"
                                        title="Coming soon"
                                    >
                                        <MoreHorizontal className="h-[15px] w-[15px] shrink-0" />
                                        More
                                        <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                                    </button>

                                </div>
                            )}

                            {/* Hidden file inputs */}
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept={IMAGE_ACCEPT}
                                multiple
                                className="hidden"
                                onChange={(e) => e.target.files && addFiles(e.target.files)}
                            />
                            <input
                                ref={docInputRef}
                                type="file"
                                accept={DOCUMENT_ACCEPT}
                                multiple
                                className="hidden"
                                onChange={(e) => e.target.files && addFiles(e.target.files)}
                            />
                        </div>

                        {/* Message textarea */}
                        <Textarea
                            ref={textareaRef}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask anything"
                            disabled={isLoading || disabled}
                            className="flex-1 min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 py-2.5 px-2 placeholder:text-[#8e8ea0] text-sm text-foreground"
                            rows={1}
                        />

                        {/* Mic + Send */}
                        <div className="flex items-center gap-1 mb-0.5 mr-0.5">
                            <button
                                className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                                title="Voice input (coming soon)"
                                disabled
                            >
                                <Mic className="h-4 w-4" />
                            </button>

                            {isLoading ? (
                                <Button
                                    onClick={onStop}
                                    size="icon"
                                    className="shrink-0 h-8 w-8 rounded-full bg-white text-black hover:bg-white/90"
                                >
                                    <Square className="h-3 w-3 fill-current" />
                                </Button>
                            ) : isProcessing ? (
                                <button
                                    disabled
                                    className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-[#4a4a4a] text-muted-foreground cursor-default"
                                    title="Processing attachment…"
                                >
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmit}
                                    disabled={!canSend}
                                    title="Send message"
                                    style={canSend ? { backgroundColor: 'var(--send-btn, #3B82F6)', color: '#fff' } : undefined}
                                    onMouseEnter={(e) => {
                                        if (canSend) {
                                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--send-btn-hover, #2563EB)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (canSend) {
                                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--send-btn, #3B82F6)';
                                        }
                                    }}
                                    className={cn(
                                        'shrink-0 h-8 w-8 flex items-center justify-center rounded-full transition-all duration-200',
                                        canSend ? 'opacity-100' : 'bg-[#4a4a4a] text-muted-foreground cursor-default',
                                    )}
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <p className="text-[11px] text-muted-foreground/50 text-center mt-2 font-medium">
                    SouvikAI can make mistakes. Consider checking important information.
                </p>
            </div>
        </div>
    );
}
