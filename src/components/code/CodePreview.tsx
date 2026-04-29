'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import type { BuilderFiles } from '@/types/code';

interface CodePreviewProps {
    files: BuilderFiles;
}

/**
 * Live preview for the Builder workspace.
 *
 * A real Next.js dev server can't run inside the browser, so we approximate
 * by compiling the project's `app/page.tsx` (or `app/layout.tsx` wrapping
 * page.tsx) as a Babel-compiled JSX component, mounting it inside an iframe,
 * and including Tailwind via its Play CDN.
 *
 * This works for self-contained components (no `import`s beyond React /
 * built-ins). Imports are detected and replaced with no-op shims so the
 * preview degrades gracefully — we surface a yellow banner so the user knows
 * the preview is best-effort.
 */
export function CodePreview({ files }: CodePreviewProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [compileWarning, setCompileWarning] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const html = useMemo(() => {
        const result = buildPreviewHTML(files);
        setCompileWarning(result.warning);
        return result.html;
    }, [files]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        // Use srcdoc for a fully isolated document. Re-assigning srcdoc forces
        // a hard reload of the iframe, which is exactly what we want when the
        // file map changes.
        iframe.srcdoc = html;
    }, [html, reloadKey]);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background">
            <div className="shrink-0 flex items-center justify-between gap-2 h-9 px-3 border-b border-border-subtle bg-surface">
                <div className="flex items-center gap-2 min-w-0">
                    {compileWarning ? (
                        <span className="flex items-center gap-1.5 text-[12px] text-warning truncate">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{compileWarning}</span>
                        </span>
                    ) : (
                        <span className="text-[12px] text-foreground-muted">Live preview</span>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setReloadKey((k) => k + 1)}
                    aria-label="Reload preview"
                    className="h-7 w-7"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div className="flex-1 min-h-0">
                <iframe
                    ref={iframeRef}
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full h-full bg-white"
                />
            </div>
        </div>
    );
}

// ── Compilation ──────────────────────────────────────────────────────────────

interface BuildResult {
    html: string;
    warning: string | null;
}

/**
 * Best-effort transform of `app/page.tsx` into a runnable component. We:
 *   1. Pick `app/page.tsx` as the entry; fall back to any `.tsx` file under app/.
 *   2. Strip `'use client'` directives.
 *   3. Replace `import` statements with comments — Babel-standalone has no
 *      module resolver in our harness. Components defined at module scope in
 *      the same file still work.
 *   4. Strip TypeScript-only constructs that Babel's `typescript` preset
 *      handles natively (so we don't need to do this ourselves), but we DO
 *      strip `import type` lines explicitly to avoid leftover imports.
 *   5. Replace `export default function Foo` (or `export default Foo`) with
 *      an assignment to `__BUILDER_DEFAULT_EXPORT__` that the harness mounts.
 */
function buildPreviewHTML(files: BuilderFiles): BuildResult {
    const entryPath = pickEntryFile(files);
    if (!entryPath) {
        return {
            html: emptyHTML('No app/page.tsx found in the project.'),
            warning: null,
        };
    }

    const raw = files[entryPath];
    const { code, hadImports } = transformEntrySource(raw);

    const warning = hadImports
        ? 'Preview is best-effort — imports are stubbed in the sandbox.'
        : null;

    const escaped = code
        .replace(/<\/script>/gi, '<\\/script>') // can't appear inside a script tag
        .replace(/<!--/g, '<\\!--');

    return {
        html: PREVIEW_TEMPLATE(escaped, entryPath),
        warning,
    };
}

function pickEntryFile(files: BuilderFiles): string | null {
    if (files['app/page.tsx']) return 'app/page.tsx';
    const fallback = Object.keys(files).find(
        (p) => p.startsWith('app/') && p.endsWith('.tsx'),
    );
    return fallback ?? null;
}

function transformEntrySource(src: string): { code: string; hadImports: boolean } {
    let hadImports = false;
    let out = src;

    // Strip 'use client' / "use client" directives.
    out = out.replace(/^\s*['"]use client['"]\s*;?\s*$/gm, '');

    // Comment out import lines (multi-line imports are a single statement
    // terminated by `;` or end-of-line). We treat any line starting with
    // `import` as an import.
    out = out.replace(
        /^\s*import\s[^;]*;?\s*$/gm,
        (m) => {
            hadImports = true;
            return `/* ${m.trim()} */`;
        },
    );

    // Replace `export default function Name(...)` -> `function Name(...)` and
    // append a default-export assignment.
    let defaultName: string | null = null;
    out = out.replace(
        /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/,
        (_m, name) => {
            defaultName = name;
            return `function ${name}`;
        },
    );

    // Replace `export default <Identifier>;` -> assignment.
    out = out.replace(
        /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/,
        (_m, name) => {
            defaultName = name;
            return '';
        },
    );

    // Strip any other `export` keywords so Babel doesn't complain about
    // module-only syntax outside of a module context.
    out = out.replace(/^\s*export\s+(default\s+)?/gm, '');

    if (defaultName) {
        out += `\n;window.__BUILDER_DEFAULT_EXPORT__ = ${defaultName};\n`;
    } else {
        // Anonymous default like `export default () => <div />`: we can't easily
        // recover this without an AST. Emit a friendly fallback.
        out += `\n;if (typeof window.__BUILDER_DEFAULT_EXPORT__ === 'undefined') {
            window.__BUILDER_DEFAULT_EXPORT__ = function Fallback() {
                return React.createElement('div',
                    { style: { padding: 24, fontFamily: 'system-ui', color: '#666' } },
                    'Preview could not detect a default export. Use \\'export default function Page() {}\\'.'
                );
            };
        }\n`;
    }

    return { code: out, hadImports };
}

function emptyHTML(message: string): string {
    return `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;color:#666;">
  <div style="text-align:center;">
    <div style="font-size:14px;">${escapeHtml(message)}</div>
    <div style="font-size:12px;margin-top:6px;color:#999;">The preview will appear here.</div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const PREVIEW_TEMPLATE = (compiledSrc: string, entryPath: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
      html, body, #root { height: 100%; }
      body { margin: 0; }
      .builder-error {
        padding: 16px 20px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 1.5;
        color: #b91c1c;
        background: #fef2f2;
        border-bottom: 1px solid #fecaca;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      // Surface uncaught errors from the Babel-transformed script below.
      window.addEventListener('error', function (e) {
        document.body.insertAdjacentHTML('afterbegin',
          '<div class="builder-error">' + (e && e.message ? String(e.message) : 'Unknown error') + '</div>');
      });
    </script>
    <script type="text/babel" data-presets="env,react,typescript">
      ${compiledSrc}

      // Mount synchronously at the end of THIS script so we run after the
      // user's code has executed (Babel-standalone transforms text/babel
      // scripts asynchronously after DOMContentLoaded, so a separate
      // DOMContentLoaded listener would race ahead of this and report
      // "No component to render" even when the entry compiles fine).
      ;(function () {
        try {
          var Component = window.__BUILDER_DEFAULT_EXPORT__;
          if (!Component) {
            document.body.insertAdjacentHTML('afterbegin',
              '<div class="builder-error">No component to render from ${escapeHtml(entryPath)}.</div>');
            return;
          }
          var root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(React.createElement(Component));
        } catch (err) {
          document.body.insertAdjacentHTML('afterbegin',
            '<div class="builder-error">' + (err && err.message ? String(err.message) : String(err)) + '</div>');
        }
      })();
    </script>
  </body>
</html>`;
