import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { systemPrompt } = await request.json();

        if (!systemPrompt || typeof systemPrompt !== 'string') {
            return NextResponse.json({ safe: true });
        }

        const apiKey = process.env.NVIDIA_NIM_API_KEY;
        if (!apiKey) {
            console.error('NVIDIA NIM API key not configured for moderation');
            // Fail open or fail closed? Silently pass if no key
            return NextResponse.json({ safe: true });
        }

        const prompt = `You are a moderation AI. Review the following custom instructions provided by a user.
Evaluate if these instructions encourage illegal acts, violence, hate speech, explicit content, or system circumvention.
Output ONLY a JSON object with a single boolean property "safe". Do NOT output any markdown, reasoning, or other text.
For example: {"safe": true} or {"safe": false}

User Instructions to moderate:
"""
${systemPrompt}
"""`;

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'meta/llama-3.1-8b-instruct',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 200,
                response_format: { type: 'json_object' } // Help enforce JSON if supported
            }),
        });

        if (!response.ok) {
            console.error('NVIDIA moderation API error:', await response.text());
            return NextResponse.json({ safe: true }); // Silently fail open if API is down
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return NextResponse.json({ safe: true });
        }

        try {
            const parsed = JSON.parse(content);
            const isSafe = parsed.safe === true || String(parsed.safe).toLowerCase() === 'true';
            return NextResponse.json({ safe: isSafe });
        } catch {
            console.error('Failed to parse moderation JSON:', content);
            // Default to safe if format is unexpected but we are suppressing notifications
            return NextResponse.json({ safe: true });
        }
    } catch (error) {
        console.error('Moderation endpoint error:', error);
        return NextResponse.json({ safe: true });
    }
}
