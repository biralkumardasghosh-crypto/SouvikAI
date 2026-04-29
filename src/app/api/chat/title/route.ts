import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/chat/title
 * Body: { sessionId: string; userMessage: string; assistantMessage: string }
 *
 * Generates a concise AI title for a chat session based on the first exchange.
 * Uses a fast, cheap model with a hard token cap so this never delays anything.
 * Called fire-and-forget from the client — failure is silent (title stays as-is).
 */
export async function POST(request: NextRequest) {
    try {
        const { sessionId, userMessage, assistantMessage } = await request.json();

        if (!sessionId || !userMessage) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const supabase = await createClient();

        // ── Auth ──────────────────────────────────────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── Verify the session belongs to this user ───────────────────────────
        const { data: session } = await supabase
            .from('chat_sessions')
            .select('id, title')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // ── Build the title-generation prompt ─────────────────────────────────
        // We only send truncated snippets to keep cost near zero.
        const userSnippet      = String(userMessage).slice(0, 300);
        const assistantSnippet = String(assistantMessage).slice(0, 300);

        const titlePrompt = `Generate a short, descriptive title for this conversation.

Rules:
- Maximum 6 words
- No punctuation (no colons, commas, quotes, or periods)
- Plain noun phrase — no verbs like "Discussing" or "Explaining"
- No markdown
- Output ONLY the title, nothing else

User: ${userSnippet}
Assistant: ${assistantSnippet}`;

        // ── Call NVIDIA NIM with a hard max_tokens cap ────────────────────────
        const apiKey = process.env.NVIDIA_NIM_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        // 10-second timeout — title generation must never block the user
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        let title = (session as { title: string }).title; // fallback to existing title on any failure

        try {
            const nimResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    // Fast, cheap model — deliberately NOT the user's selected model
                    model: 'meta/llama-3.1-8b-instruct',
                    messages: [{ role: 'user', content: titlePrompt }],
                    temperature: 0.3,
                    max_tokens: 20,   // 6 words max → 20 tokens is more than enough
                    stream: false,
                }),
                signal: controller.signal,
            });

            if (nimResponse.ok) {
                const nimData = await nimResponse.json();
                const raw = nimData.choices?.[0]?.message?.content?.trim() ?? '';

                // Sanitise: strip surrounding quotes/markdown, collapse whitespace,
                // enforce a hard character cap so a misbehaving model can't break the UI.
                const cleaned = raw
                    .replace(/^["'`*_]+|["'`*_]+$/g, '')   // strip leading/trailing punctuation
                    .replace(/\s+/g, ' ')                   // collapse whitespace
                    .slice(0, 60)                           // hard cap
                    .trim();

                if (cleaned.length >= 2) {
                    title = cleaned;
                }
            }
        } finally {
            clearTimeout(timeout);
        }

        // ── Persist the new title ─────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
            .from('chat_sessions')
            .update({ title })
            .eq('id', sessionId)
            .eq('user_id', user.id);

        return NextResponse.json({ title });
    } catch {
        // Title generation is best-effort — never surface errors to the client
        return NextResponse.json({ error: 'Failed to generate title' }, { status: 500 });
    }
}
