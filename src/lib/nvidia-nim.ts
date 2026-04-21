interface NvidiaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface NvidiaStreamResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        delta: {
            role?: string;
            content?: string;
        };
        finish_reason: string | null;
    }[];
}

export async function streamNvidiaCompletion(
    messages: NvidiaMessage[],
    options: {
        model: string;
        temperature: number;
        maxTokens: number;
        signal?: AbortSignal;
    }
): Promise<ReadableStream<Uint8Array>> {
    const apiKey = process.env.NVIDIA_NIM_API_KEY;

    if (!apiKey) {
        throw new Error('NVIDIA NIM API key not configured');
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: options.model,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            stream: true,
        }),
        signal: options.signal,
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`NVIDIA API error: ${error}`);
    }

    if (!response.body) {
        throw new Error('No response body');
    }

    return response.body;
}

export function parseSSEStream(
    stream: ReadableStream<Uint8Array>
): ReadableStream<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    return new ReadableStream({
        async start(controller) {
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    controller.close();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            controller.close();
                            return;
                        }

                        try {
                            const parsed: NvidiaStreamResponse = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                controller.enqueue(content);
                            }
                        } catch {
                            // Skip malformed JSON
                        }
                    }
                }
            }
        },
    });
}
