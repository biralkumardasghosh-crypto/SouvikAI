/**
 * web-search.ts
 *
 * Pluggable web-search provider with a graceful fallback chain. Providers are
 * tried in order; the first one that returns a non-empty result set wins. If
 * none are configured / all fail, an empty result set is returned and the
 * caller is expected to degrade gracefully (the chat flow already does this).
 *
 * Provider order:
 *   1. Brave    — needs BRAVE_API_KEY   (independent index, generous free tier)
 *   2. Tavily   — needs TAVILY_API_KEY  (LLM-tuned snippets; good as a fallback)
 *   3. Serper   — needs SERPER_API_KEY  (Google results, paid)
 *   4. DuckDuckGo Instant Answer — no key, but only covers a narrow slice of
 *      queries (disambiguation pages, abstracts). Acts as a last-resort filler.
 *
 * Each provider has its own ~6s timeout so a slow provider never burns the
 * entire request budget; the chain bails as soon as one succeeds.
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
    /** Which provider returned the results (for logging / debugging). */
    provider?: string;
}

const PROVIDER_TIMEOUT_MS = 6_000;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run `query` through the configured provider chain. Returns at most `limit`
 * results. Never throws — failures are logged and the chain falls through.
 */
export async function searchWeb(
    query: string,
    limit = 5,
): Promise<WebSearchResponse> {
    const providers: Array<{ name: string; run: () => Promise<WebSearchResult[]> }> = [];

    if (process.env.BRAVE_API_KEY)  providers.push({ name: 'brave',  run: () => braveSearch(query, limit)  });
    if (process.env.TAVILY_API_KEY) providers.push({ name: 'tavily', run: () => tavilySearch(query, limit) });
    if (process.env.SERPER_API_KEY) providers.push({ name: 'serper', run: () => serperSearch(query, limit) });
    // DDG IA is always available as a last resort; it's keyless.
    providers.push({ name: 'ddg-ia', run: () => duckDuckGoInstantAnswer(query, limit) });

    for (const { name, run } of providers) {
        try {
            const results = await run();
            if (results.length > 0) {
                return { query, results: results.slice(0, limit), provider: name };
            }
        } catch (err) {
            console.error(`[web-search] provider "${name}" failed:`, (err as Error).message);
            // continue to next provider
        }
    }

    return { query, results: [], provider: 'none' };
}

/**
 * Format search results as a readable context block to inject into the system
 * prompt sent to the LLM.
 */
export function formatSearchContext(
    query: string,
    results: WebSearchResult[],
): string {
    if (results.length === 0) {
        return `Web search for "${query}" returned no results. Answer from your own knowledge and tell the user the search came up empty.`;
    }
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

// ── Providers ────────────────────────────────────────────────────────────────

/**
 * Tavily — optimised for AI agents. Returns clean snippets ready to ground an
 * LLM. https://docs.tavily.com/docs/rest-api/api-reference
 */
async function tavilySearch(query: string, limit: number): Promise<WebSearchResult[]> {
    const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query,
            max_results: limit,
            search_depth: 'basic',
            include_answer: false,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    const data = await res.json() as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return (data.results ?? [])
        .map((r) => normaliseResult(r.url, r.title, r.content))
        .filter((r): r is WebSearchResult => r !== null);
}

/**
 * Brave Search API. https://brave.com/search/api/
 */
async function braveSearch(query: string, limit: number): Promise<WebSearchResult[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));

    const res = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': process.env.BRAVE_API_KEY!,
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const data = await res.json() as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };

    return (data.web?.results ?? [])
        .map((r) => normaliseResult(r.url, r.title, r.description))
        .filter((r): r is WebSearchResult => r !== null);
}

/**
 * Serper.dev — Google results as JSON. https://serper.dev/
 */
async function serperSearch(query: string, limit: number): Promise<WebSearchResult[]> {
    const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
            'X-API-KEY': process.env.SERPER_API_KEY!,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: limit }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
    const data = await res.json() as {
        organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };

    return (data.organic ?? [])
        .map((r) => normaliseResult(r.link, r.title, r.snippet))
        .filter((r): r is WebSearchResult => r !== null);
}

/**
 * DuckDuckGo Instant Answer API — keyless but very narrow. Only really returns
 * useful data for queries that map to a Wikipedia-style abstract or a
 * disambiguation page. Used as a no-config last resort.
 *
 * Docs: https://duckduckgo.com/api
 */
async function duckDuckGoInstantAnswer(query: string, limit: number): Promise<WebSearchResult[]> {
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '0');
    url.searchParams.set('t', 'souvik-ai');

    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`DDG-IA HTTP ${res.status}`);

    const data = await res.json() as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<{
            Text?: string;
            FirstURL?: string;
            Topics?: Array<{ Text?: string; FirstURL?: string }>;
        }>;
    };

    const out: WebSearchResult[] = [];

    if (data.AbstractText && data.AbstractURL) {
        const r = normaliseResult(data.AbstractURL, data.Heading || query, data.AbstractText);
        if (r) out.push(r);
    }

    // RelatedTopics can be flat or nested under .Topics — flatten both shapes.
    const flatten = (data.RelatedTopics ?? []).flatMap((t) =>
        t.Topics ? t.Topics : [t],
    );
    for (const t of flatten) {
        if (out.length >= limit) break;
        const title = t.Text?.split(' - ')[0];
        const r = normaliseResult(t.FirstURL, title, t.Text);
        if (r) out.push(r);
    }

    return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseResult(
    rawUrl: string | undefined,
    rawTitle: string | undefined,
    rawSnippet: string | undefined,
): WebSearchResult | null {
    if (!rawUrl || !rawTitle) return null;

    let domain: string;
    try {
        domain = new URL(rawUrl).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }

    return {
        title:   stripHtml(rawTitle),
        url:     rawUrl,
        snippet: stripHtml(rawSnippet ?? ''),
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=16`,
    };
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
