/**
 * web-search.ts
 * Serper.dev (Google Search API) integration.
 * Requires SERPER_API_KEY environment variable.
 *
 * Called directly by the chat route; also exposed via /api/tools/web-search.
 */

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
    favicon: string;
}

export interface WebSearchResponse {
    query: string;
    results: WebSearchResult[];
}

interface SerperOrganicResult {
    title?: string;
    link?: string;
    snippet?: string;
}

interface SerperResponse {
    organic?: SerperOrganicResult[];
}

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

/**
 * Perform a web search via Serper.dev.
 * Returns up to `limit` results (default 5).
 */
export async function searchWeb(
    query: string,
    limit = 5,
): Promise<WebSearchResponse> {
    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
        console.error('[Web Search] SERPER_API_KEY is not set');
        return { query, results: [] };
    }

    const response = await fetch(SERPER_ENDPOINT, {
        method: 'POST',
        headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            q: query,
            num: limit,
        }),
        signal: AbortSignal.timeout(9_000),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
            `Serper returned HTTP ${response.status}${errText ? `: ${errText}` : ''}`,
        );
    }

    const data = (await response.json()) as SerperResponse;
    const organic = Array.isArray(data.organic) ? data.organic : [];

    const results: WebSearchResult[] = [];
    for (const item of organic.slice(0, limit)) {
        const url = item.link?.trim();
        const title = item.title?.trim();
        if (!url || !title) continue;

        let domain = '';
        try {
            domain = new URL(url).hostname.replace(/^www\./, '');
        } catch {
            continue; // skip malformed URLs
        }

        results.push({
            title,
            url,
            snippet: (item.snippet ?? '').trim(),
            favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=16`,
        });
    }

    return { query, results };
}

/**
 * Format search results as a readable context block to inject into the
 * system prompt sent to the LLM.
 */
export function formatSearchContext(
    query: string,
    results: WebSearchResult[],
): string {
    const lines = [
        `Web search results for: "${query}"`,
        '',
        ...results.map(
            (r, i) =>
                `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`,
        ),
        '',
        'Use the above results to inform your response. Cite source numbers like [1] when referencing them.',
    ];
    return lines.join('\n');
}
