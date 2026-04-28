/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatSearchContext, type WebSearchResult } from '@/lib/web-search';

/**
 * Injects tool-use instructions and search results into an apiMessages array.
 *
 * Two-phase contract with the model:
 *  1. First pass — `tool === 'searchWeb'` and no results yet. Append usage
 *     instructions to the system prompt so the model emits a `<search>` tag.
 *  2. Second pass — results have been fetched on the client. Insert a system
 *     message containing the formatted results and forbid further `<search>`
 *     emissions (the model otherwise tends to recurse).
 *
 * Mutates `apiMessages` in place — chosen over returning a new array because
 * the caller already builds the array as `let` and the splice on the second
 * pass needs to happen at length-1.
 */
export function applyWebSearchTool(
    apiMessages: any[],
    args: {
        tool?: string;
        searchResults?: WebSearchResult[];
        searchResultsQuery?: string;
    },
): void {
    const { tool, searchResults, searchResultsQuery } = args;

    if (tool === 'searchWeb' && (!searchResults || searchResults.length === 0)) {
        apiMessages[0].content += [
            '',
            '',
            '[TOOL AVAILABLE: searchWeb]',
            "You can search the web for real-time or up-to-date information. To do so, output ONE line containing ONLY a <search> tag whose contents are concise search keywords derived from the user's request. Do NOT include any other text, explanation, or <think> block — just the tag.",
            '',
            'Format:  <search>KEYWORDS</search>',
            'Example: if the user asks "what is the latest version of Next.js?", you must output exactly:',
            '<search>latest Next.js version</search>',
            '',
            'Replace the keywords with what is actually relevant to the user\'s prompt. Never output the literal placeholder text "KEYWORDS" or "your search query".',
        ].join('\n');
        return;
    }

    if (searchResults && searchResults.length > 0) {
        apiMessages.splice(apiMessages.length - 1, 0, {
            role: 'system' as const,
            content:
                formatSearchContext(searchResultsQuery || 'Search', searchResults) +
                '\n\nIMPORTANT: The web search has already been performed. Do NOT emit another <search> tag under any circumstances. Answer the user using the results above and cite sources like [1], [2].',
        });
    }
}
