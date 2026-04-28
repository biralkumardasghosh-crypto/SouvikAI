/**
 * NVIDIA NIM emits its reasoning between `<think>...</think>` blocks. The
 * Builder UI only ever displays the final-answer text and structured tags,
 * so the agent route runs each chunk through this stripper before handing
 * it off to the tag parser.
 *
 * The function returned closes over `inside` — that state is per-request
 * (the factory is called once per stream) to avoid cross-invocation leaks.
 */
export function createThinkStripper(): (chunk: string) => string {
    let inside = false;
    return (chunk: string): string => {
        let out = '';
        let i = 0;
        while (i < chunk.length) {
            if (!inside) {
                const open = chunk.indexOf('<think>', i);
                if (open === -1) {
                    out += chunk.slice(i);
                    break;
                }
                out += chunk.slice(i, open);
                inside = true;
                i = open + '<think>'.length;
            } else {
                const close = chunk.indexOf('</think>', i);
                if (close === -1) break; // drop rest of chunk; still inside
                inside = false;
                i = close + '</think>'.length;
            }
        }
        return out;
    };
}
