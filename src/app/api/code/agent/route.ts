/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

import { rejectCrossOrigin } from '@/lib/api/origin-guard';
import { checkRateAndQuota, estimateTokens, logRequest } from '@/lib/api/quota';
import { surfaceServerError } from '@/lib/api/error-response';
import {
    DEFAULT_QUOTA_LIMIT,
    MAX_BUILDER_HISTORY_TURNS,
    MAX_INPUT_CHARS,
} from '@/lib/limits';

import { buildBuilderSystemPrompt } from '@/lib/code-agent/system-prompt';
import { insertBuilderMessage, loadWorkspaceForUser } from '@/lib/code-agent/db';
import { renderHistoryContent } from '@/lib/code-agent/history';
import { runAgentTurn } from '@/lib/code-agent/runner';

export const runtime = 'nodejs';

type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];

interface AgentRequestBody {
    /** Workspace this turn belongs to. Server is the source of truth. */
    workspaceId: string;
    /**
     * Optional new user message. If omitted, the agent runs against whatever
     * is currently in the DB (used to auto-resume after a workspace was
     * created with an initial message).
     */
    message?: string;
    /** Optional model id (resolves against the `models` table; 'auto' picks one). */
    model?: string;
}

/**
 * POST /api/code/agent
 *
 * Runs one builder agent turn and streams the timeline back as NDJSON.
 * Validation, model resolution, and quota checks live here; the actual
 * phase loop is in `lib/code-agent/runner.ts`.
 */
export async function POST(request: NextRequest) {
    try {
        const forbidden = rejectCrossOrigin(request);
        if (forbidden) return forbidden;

        const body = (await request.json()) as Partial<AgentRequestBody>;
        const workspaceId = (body.workspaceId ?? '').toString();
        const newMessage = (body.message ?? '').toString();
        const requestedModel = body.model || 'auto';

        if (!workspaceId) {
            return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        if (newMessage.length > MAX_INPUT_CHARS) {
            return NextResponse.json(
                {
                    error: `Message exceeds the maximum allowed length of ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
                },
                { status: 400 },
            );
        }

        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── Admin settings + models in parallel ─────────────────────────────
        const [settingsRes, modelsRes] = await Promise.all([
            supabase.from('admin_settings').select('*').single(),
            supabase.from('models').select('*'),
        ]);

        const adminSettings = settingsRes.data as AdminSettingsRow | null;
        if (adminSettings?.edit_mode) {
            return NextResponse.json(
                { error: 'We are currently updating our services, try again later.' },
                { status: 503 },
            );
        }

        const allModels: any[] = Array.isArray(modelsRes.data) ? modelsRes.data : [];
        let dbModel: any = null;
        if (requestedModel === 'auto') {
            dbModel = allModels.find((m) => !m.is_suspended) ?? allModels[0];
        } else {
            dbModel = allModels.find((m) => m.id === requestedModel);
        }
        if (!dbModel) {
            return NextResponse.json({ error: 'Model not found' }, { status: 404 });
        }
        if (dbModel.is_suspended) {
            return NextResponse.json(
                { error: "This model is currently suspended. We're working on it." },
                { status: 503 },
            );
        }

        const modelId: string = dbModel.id;
        const quotaLimit: number = dbModel.quota_limit ?? DEFAULT_QUOTA_LIMIT;

        // ── Rate / quota check ──────────────────────────────────────────────
        const gateRes = await checkRateAndQuota(supabase, user.id, modelId, quotaLimit);
        if (gateRes.response) return gateRes.response;
        const tokensUsed = gateRes.tokensUsed;

        // ── Persist the new user message (if provided) ──────────────────────
        if (newMessage.trim()) {
            try {
                await insertBuilderMessage(supabase, {
                    workspaceId,
                    userId: user.id,
                    role: 'user',
                    content: newMessage.trim(),
                });
            } catch (err) {
                console.error('[Builder] Failed to insert user message:', err);
                return NextResponse.json(
                    { error: 'Failed to save your message. Please try again.' },
                    { status: 500 },
                );
            }
        }

        // ── Load workspace state from the DB (source of truth) ──────────────
        const workspace = await loadWorkspaceForUser(supabase, workspaceId, user.id);
        if (!workspace) {
            return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
        }

        // The most recent user message must be unanswered (no following
        // assistant message). Otherwise this is a duplicate / stale call.
        const lastMsg = workspace.messages[workspace.messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'user') {
            return NextResponse.json(
                { error: 'No pending user message to respond to.' },
                { status: 400 },
            );
        }

        // Fire-and-forget request log.
        logRequest(supabase, user.id, modelId);

        // ── Build the prompt payload ────────────────────────────────────────
        const systemPrompt = buildBuilderSystemPrompt(workspace.files);

        // History excludes the just-inserted user message — we send that
        // separately as the final user turn so the model sees it as the
        // current request.
        const priorMessages = workspace.messages.slice(0, -1);
        const trimmed = priorMessages.slice(-MAX_BUILDER_HISTORY_TURNS).map((m) => ({
            role: m.role,
            content: renderHistoryContent(m.role, m.content, m.steps ?? []),
        }));

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...trimmed,
            { role: 'user', content: lastMsg.content },
        ];

        const temperature = adminSettings?.temperature ?? 0.6;
        const maxTokens = Math.max(adminSettings?.max_tokens ?? 0, 4096);
        const modelName: string =
            dbModel.name || adminSettings?.model_name || 'meta/llama-3.1-8b-instruct';

        // ── Run the agent and stream NDJSON back ────────────────────────────
        const out = runAgentTurn({
            supabase,
            workspaceId,
            userId: user.id,
            modelId,
            modelName,
            temperature,
            maxTokens,
            apiMessages,
        });

        const inputTokens = estimateTokens(apiMessages.map((m) => m.content).join(' '));
        const newTotal = tokensUsed + inputTokens;
        return new Response(out, {
            headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'X-Quota-Used': String(newTotal),
                'X-Quota-Limit': String(quotaLimit),
            },
        });
    } catch (error) {
        return surfaceServerError(error, 'Failed to process request', '[Builder Agent] route error:');
    }
}
