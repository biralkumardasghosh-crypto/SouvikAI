'use client';

import { useEffect, useRef } from 'react';
import type { BuilderFiles } from '@/types/code';

interface CodePreviewProps {
    /** Pre-compiled preview HTML, produced by {@link buildPreviewHTML}. */
    html: string;
    /**
     * Bumped by the parent toolbar's reload button to force the iframe to
     * re-evaluate the same HTML (useful when the user wants to re-run a
     * preview that has runtime errors).
     */
    reloadKey?: number;
}

/**
 * Sandboxed iframe shell for the Builder workspace.
 *
 * The iframe is a self-contained mini-bundler: it ships with Tailwind via
 * CDN, Babel-standalone for TS/JSX compilation, and a runtime
 * ({@link builderRuntime}) that builds an ES-module graph from the project's
 * virtual files at load time. That runtime resolves bare specifiers against
 * `esm.sh` (React, lucide-react, Radix, clsx, tailwind-merge, …), shims the
 * Next.js client APIs (`next/link`, `next/image`, `next/navigation`,
 * `next/font/*`, …), and links project files to each other via Blob URLs —
 * giving the preview a development experience close to a real Next.js
 * project, including multi-file pages with components and utilities.
 */
export function CodePreview({ html, reloadKey = 0 }: CodePreviewProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        // Re-assigning srcdoc forces a hard reload of the iframe, which is
        // exactly what we want when either the compiled HTML changes or the
        // user clicks "Reload preview".
        iframe.srcdoc = html;
    }, [html, reloadKey]);

    return (
        <div className="flex-1 min-h-0 bg-background">
            <iframe
                ref={iframeRef}
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                className="w-full h-full bg-white"
            />
        </div>
    );
}

// ── Compilation ──────────────────────────────────────────────────────────────

export interface PreviewBuild {
    html: string;
    /**
     * Soft warning surfaced inline with the preview toolbar. The new
     * full-graph sandbox doesn't need to warn about stubbed imports anymore,
     * so this is currently always `null` — kept for forward compatibility
     * with any future best-effort messaging (e.g. unsupported APIs).
     */
    warning: string | null;
}

/**
 * Build the HTML for the preview iframe.
 *
 * The host-side work is now intentionally minimal: pick an entry file,
 * serialize the virtual project's files into the document, and embed the
 * runtime that does the real bundling at load time. This keeps the host
 * bundle small (no in-host TS/JSX compiler) and lets the iframe re-use the
 * Babel-standalone instance it loads anyway.
 */
export function buildPreviewHTML(files: BuilderFiles): PreviewBuild {
    const entryPath = pickEntryFile(files);
    if (!entryPath) {
        return {
            html: emptyHTML('No app/page.tsx found in the project.'),
            warning: null,
        };
    }
    return {
        html: PREVIEW_TEMPLATE(files, entryPath),
        warning: null,
    };
}

function pickEntryFile(files: BuilderFiles): string | null {
    if (files['app/page.tsx']) return 'app/page.tsx';
    const fallback = Object.keys(files).find(
        (p) => p.startsWith('app/') && p.endsWith('.tsx'),
    );
    return fallback ?? null;
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

/**
 * Encode a value for safe embedding inside a `<script>` block.
 *
 * The browser parses `</script>` greedily inside script bodies, so we
 * unicode-escape the angle brackets (and ampersands for safety). We also
 * escape JS-only line separators that JSON.stringify happily preserves but
 * which would terminate JS string literals if the script body was loaded via
 * `eval`-style routes.
 */
function jsonForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

// ── In-iframe runtime ────────────────────────────────────────────────────────

/**
 * The compile + module-graph runtime that executes *inside* the preview
 * iframe.
 *
 * Written as a regular function so it gets type-checking at the host build
 * step, then stringified into the preview HTML via `Function.prototype
 * .toString()`. The host TypeScript compiler strips type annotations before
 * stringification, so the function body lands in the iframe as plain ES
 * that Babel-standalone (already loaded inside the iframe) can run.
 *
 * This function MUST be self-contained — no closure references to host
 * scope, no module imports, no top-level `await`.
 *
 * High-level flow:
 *  1. Wait for `window.Babel` (loaded async via `<script>`).
 *  2. Read the embedded virtual file system.
 *  3. Inject every `*.css` file into a `<style>` so Tailwind / globals apply.
 *  4. Parse every `.ts(x)` / `.js(x)` file with `@babel/parser` to extract
 *     its imports.
 *  5. Topologically sort by intra-project dependencies (cycles are broken).
 *  6. Compile each file in order with a Babel plugin that rewrites import
 *     specifiers into:
 *       - Blob URLs for already-compiled project files.
 *       - Blob URLs for hand-rolled `next/*` and `*-only` stubs.
 *       - `https://esm.sh/...` URLs for everything else (with React pinned).
 *  7. Mount via a tiny module that imports the entry's default export and
 *     hands it to React 18's `createRoot`.
 */
function builderRuntime() {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any;

    function showError(msg: unknown) {
        const text = String(
            (msg && (msg as any).message) || msg || 'Unknown error',
        );
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        document.body.insertAdjacentHTML(
            'afterbegin',
            '<div class="builder-error">' + escaped + '</div>',
        );
    }

    window.addEventListener('error', (e) => {
        showError((e as ErrorEvent).message || 'Unknown error');
    });
    window.addEventListener('unhandledrejection', (e) => {
        const reason = (e as PromiseRejectionEvent).reason;
        showError(reason);
    });

    // ──────────────────────────────────────────────────────────────────────
    // Wait for Babel-standalone (the <script> tag loads it async).
    // ──────────────────────────────────────────────────────────────────────
    const ready = new Promise<void>((res) => {
        if (w.Babel) return res();
        const t = setInterval(() => {
            if (w.Babel) {
                clearInterval(t);
                res();
            }
        }, 20);
    });

    ready
        .then(() => {
            const Babel = w.Babel;

            const filesEl = document.getElementById('builder-files');
            if (!filesEl) {
                showError('Internal preview error: missing files payload.');
                return;
            }
            const files: Record<string, string> = JSON.parse(
                filesEl.textContent || '{}',
            );
            const entryPath: string = w.__BUILDER_ENTRY__;

            // Pinned versions for esm.sh — kept aligned with BASE_TEMPLATE.
            const REACT_VERSION = '18.3.1';
            const ESM = 'https://esm.sh';
            const REACT_DEPS =
                '?deps=react@' + REACT_VERSION + ',react-dom@' + REACT_VERSION;

            // ── Resolution ─────────────────────────────────────────────────
            const isCSS = (s: string) => /\.css(\?.*)?$/i.test(s);
            const isJSish = (p: string) => /\.(t|j)sx?$/i.test(p);

            function resolveProjectPath(
                spec: string,
                fromPath: string,
            ): string | null {
                let base: string;
                if (spec.startsWith('./') || spec.startsWith('../')) {
                    const dir = fromPath.split('/').slice(0, -1).join('/');
                    const parts = (dir + '/' + spec).split('/');
                    const stack: string[] = [];
                    for (const p of parts) {
                        if (p === '' || p === '.') continue;
                        if (p === '..') stack.pop();
                        else stack.push(p);
                    }
                    base = stack.join('/');
                } else if (spec.startsWith('@/')) {
                    base = spec.slice(2);
                } else {
                    return null;
                }
                const candidates = [
                    base,
                    base + '.tsx',
                    base + '.ts',
                    base + '.jsx',
                    base + '.js',
                    base + '/index.tsx',
                    base + '/index.ts',
                    base + '/index.jsx',
                    base + '/index.js',
                ];
                for (const c of candidates) {
                    if (files[c] != null) return c;
                }
                return null;
            }

            // ── Lightweight client-side stubs for Next.js & friends ────────
            // Each stub is a tiny ESM module so it can be linked in via a
            // Blob URL just like project files.
            const STUBS: Record<string, string> = {
                'next/link':
                    "import * as React from '" +
                    ESM +
                    '/react@' +
                    REACT_VERSION +
                    "';\n" +
                    'function Link(props) {\n' +
                    '  let href = props.href;\n' +
                    "  if (href && typeof href === 'object') href = href.pathname || '/';\n" +
                    '  const { prefetch, replace, scroll, shallow, locale, legacyBehavior, passHref, ...rest } = props;\n' +
                    "  return React.createElement('a', { ...rest, href });\n" +
                    '}\n' +
                    'export default Link;\n',

                'next/image':
                    "import * as React from '" +
                    ESM +
                    '/react@' +
                    REACT_VERSION +
                    "';\n" +
                    'function NextImage(props) {\n' +
                    '  let src = props.src;\n' +
                    "  if (src && typeof src === 'object') src = src.src || src.default || '';\n" +
                    '  const { priority, placeholder, blurDataURL, fill, sizes, quality, loader, unoptimized, onLoadingComplete, ...rest } = props;\n' +
                    "  const style = fill ? Object.assign({}, rest.style || {}, { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: rest.objectFit || 'cover' }) : rest.style;\n" +
                    "  return React.createElement('img', Object.assign({}, rest, { src: src, style: style }));\n" +
                    '}\n' +
                    'export default NextImage;\n',

                'next/navigation':
                    'const noop = () => {};\n' +
                    'export function useRouter() { return { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }; }\n' +
                    "export function usePathname() { return '/'; }\n" +
                    'export function useSearchParams() { return new URLSearchParams(); }\n' +
                    'export function useParams() { return {}; }\n' +
                    'export function useSelectedLayoutSegment() { return null; }\n' +
                    'export function useSelectedLayoutSegments() { return []; }\n' +
                    'export function redirect() {}\n' +
                    'export function permanentRedirect() {}\n' +
                    'export function notFound() {}\n',

                'next/router':
                    'const noop = () => {};\n' +
                    "export function useRouter() { return { push: noop, replace: noop, back: noop, forward: noop, reload: noop, prefetch: noop, query: {}, asPath: '/', pathname: '/', route: '/', isReady: true, events: { on: noop, off: noop, emit: noop } }; }\n" +
                    'export default { useRouter: useRouter };\n',

                'next/font/google':
                    "function makeFont() { return function () { return { className: '', style: {}, variable: '' }; }; }\n" +
                    'export const Inter = makeFont();\n' +
                    'export const Roboto = makeFont();\n' +
                    'export const Roboto_Mono = makeFont();\n' +
                    'export const Geist = makeFont();\n' +
                    'export const Geist_Mono = makeFont();\n' +
                    'export const Space_Mono = makeFont();\n' +
                    'export const Space_Grotesk = makeFont();\n' +
                    'export const Playfair_Display = makeFont();\n' +
                    'export const Bricolage_Grotesque = makeFont();\n' +
                    'export const Poppins = makeFont();\n' +
                    'export const Manrope = makeFont();\n' +
                    'export const DM_Sans = makeFont();\n' +
                    'export const DM_Mono = makeFont();\n' +
                    'export const JetBrains_Mono = makeFont();\n' +
                    'export const Fira_Code = makeFont();\n' +
                    'export const Source_Sans_3 = makeFont();\n' +
                    'export const Outfit = makeFont();\n' +
                    'export const Plus_Jakarta_Sans = makeFont();\n' +
                    'export default makeFont();\n',

                'next/font/local':
                    "export default function localFont() { return { className: '', style: {}, variable: '' }; }\n",

                'next/headers':
                    'export function cookies() { return { get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }; }\n' +
                    'export function headers() { return new Headers(); }\n' +
                    'export function draftMode() { return { isEnabled: false, enable: () => {}, disable: () => {} }; }\n',

                'next/dynamic':
                    "import * as React from '" +
                    ESM +
                    '/react@' +
                    REACT_VERSION +
                    "';\n" +
                    'export default function dynamic(loader, options) {\n' +
                    '  const Lazy = React.lazy(() => Promise.resolve(loader()).then((m) => ({ default: m && m.default ? m.default : m })));\n' +
                    '  return function Wrapper(props) {\n' +
                    '    const fallback = options && options.loading ? React.createElement(options.loading) : null;\n' +
                    '    return React.createElement(React.Suspense, { fallback: fallback }, React.createElement(Lazy, props));\n' +
                    '  };\n' +
                    '}\n',

                'next/script':
                    "import * as React from '" +
                    ESM +
                    '/react@' +
                    REACT_VERSION +
                    "';\n" +
                    "export default function Script(_props) { return React.createElement(React.Fragment); }\n",

                'next/cache':
                    'const noop = () => {};\n' +
                    'export function revalidatePath() {}\n' +
                    'export function revalidateTag() {}\n' +
                    'export function unstable_cache(fn) { return fn; }\n' +
                    'export const unstable_noStore = noop;\n',

                'server-only': '// no-op stub for the preview\nexport {};\n',
                'client-only': '// no-op stub for the preview\nexport {};\n',
            };

            const stubURLs: Record<string, string> = {};
            function makeBlobURL(text: string): string {
                return URL.createObjectURL(
                    new Blob([text], { type: 'application/javascript' }),
                );
            }

            function externalURL(spec: string): string {
                if (STUBS[spec]) {
                    if (!stubURLs[spec]) {
                        stubURLs[spec] = makeBlobURL(STUBS[spec]);
                    }
                    return stubURLs[spec];
                }
                // Pinned react family — match what the React preset injects.
                if (spec === 'react') return ESM + '/react@' + REACT_VERSION;
                if (spec === 'react-dom')
                    return ESM + '/react-dom@' + REACT_VERSION + REACT_DEPS;
                if (spec === 'react-dom/client')
                    return (
                        ESM + '/react-dom@' + REACT_VERSION + '/client' + REACT_DEPS
                    );
                if (spec === 'react/jsx-runtime')
                    return ESM + '/react@' + REACT_VERSION + '/jsx-runtime';
                if (spec === 'react/jsx-dev-runtime')
                    return ESM + '/react@' + REACT_VERSION + '/jsx-dev-runtime';
                if (spec.startsWith('react/'))
                    return ESM + '/react@' + REACT_VERSION + '/' + spec.slice(6);
                if (spec.startsWith('react-dom/'))
                    return (
                        ESM +
                        '/react-dom@' +
                        REACT_VERSION +
                        '/' +
                        spec.slice(10) +
                        REACT_DEPS
                    );
                // Anything else: hand off to esm.sh, pinning React deps so a
                // package's transitive dependencies don't pull in a second
                // React copy and break hooks.
                return ESM + '/' + spec + REACT_DEPS;
            }

            // ── Phase 1: parse imports for every project module ───────────
            type ResolvedImport = { spec: string; resolved: string };
            const graph: Record<string, ResolvedImport[]> = {};

            for (const path of Object.keys(files)) {
                if (!isJSish(path)) continue;
                const src = files[path];
                let parsed: any = null;
                try {
                    parsed = Babel.packages.parser.parse(src, {
                        sourceType: 'module',
                        plugins: ['jsx', 'typescript'],
                        errorRecovery: true,
                    });
                } catch {
                    parsed = null;
                }
                const list: ResolvedImport[] = [];
                if (parsed && parsed.program && parsed.program.body) {
                    for (const node of parsed.program.body as any[]) {
                        let spec: string | null = null;
                        if (node.type === 'ImportDeclaration') {
                            spec = node.source.value;
                        } else if (
                            (node.type === 'ExportAllDeclaration' ||
                                node.type === 'ExportNamedDeclaration') &&
                            node.source
                        ) {
                            spec = node.source.value;
                        }
                        if (spec == null || isCSS(spec)) continue;
                        const resolved = resolveProjectPath(spec, path);
                        if (resolved) list.push({ spec, resolved });
                    }
                }
                graph[path] = list;
            }

            // ── Phase 2: topological sort (cycles broken at back-edges) ───
            const order: string[] = [];
            const status: Record<string, 'pending' | 'done'> = {};
            function visit(path: string) {
                if (status[path] === 'done') return;
                if (status[path] === 'pending') return;
                status[path] = 'pending';
                for (const dep of graph[path] || []) {
                    visit(dep.resolved);
                }
                status[path] = 'done';
                order.push(path);
            }
            for (const p of Object.keys(graph)) visit(p);

            // ── Phase 3: inject project CSS into a single <style> tag ─────
            const cssChunks: string[] = [];
            for (const p of Object.keys(files)) {
                if (p.endsWith('.css')) {
                    cssChunks.push('/* ' + p + ' */\n' + files[p]);
                }
            }
            if (cssChunks.length > 0) {
                const styleEl = document.createElement('style');
                styleEl.setAttribute('data-builder', 'project-css');
                styleEl.textContent = cssChunks.join('\n\n');
                document.head.appendChild(styleEl);
            }

            // ── Phase 4: compile each project file in order ───────────────
            const blobUrls: Record<string, string> = {};

            // Build the Babel plugin lazily for each file so we can close over
            // the right `specMap` (resolved project deps) without touching
            // global state.
            function buildRewritePlugin(specMap: Record<string, string>) {
                function mapSpec(spec: string): { remove: boolean; value: string } {
                    if (isCSS(spec)) return { remove: true, value: spec };
                    if (specMap[spec]) return { remove: false, value: specMap[spec] };
                    if (
                        spec.startsWith('./') ||
                        spec.startsWith('../') ||
                        spec.startsWith('@/')
                    ) {
                        // Project import we couldn't resolve — leave bare so the
                        // browser surfaces a clear failure pointing at the path.
                        return { remove: false, value: spec };
                    }
                    return { remove: false, value: externalURL(spec) };
                }
                return function () {
                    return {
                        visitor: {
                            ImportDeclaration(p: any) {
                                const r = mapSpec(p.node.source.value);
                                if (r.remove) {
                                    p.remove();
                                    return;
                                }
                                p.node.source.value = r.value;
                            },
                            ExportAllDeclaration(p: any) {
                                if (!p.node.source) return;
                                const r = mapSpec(p.node.source.value);
                                if (r.remove) {
                                    p.remove();
                                    return;
                                }
                                p.node.source.value = r.value;
                            },
                            ExportNamedDeclaration(p: any) {
                                if (!p.node.source) return;
                                const r = mapSpec(p.node.source.value);
                                if (r.remove) {
                                    p.node.source = null;
                                    return;
                                }
                                p.node.source.value = r.value;
                            },
                            CallExpression(p: any) {
                                // Dynamic `import('spec')`.
                                const callee = p.node.callee;
                                if (
                                    callee &&
                                    callee.type === 'Import' &&
                                    p.node.arguments.length === 1 &&
                                    p.node.arguments[0].type === 'StringLiteral'
                                ) {
                                    const arg = p.node.arguments[0];
                                    const r = mapSpec(arg.value);
                                    if (!r.remove) arg.value = r.value;
                                }
                            },
                        },
                    };
                };
            }

            for (const path of order) {
                const specMap: Record<string, string> = {};
                for (const dep of graph[path] || []) {
                    if (blobUrls[dep.resolved]) {
                        specMap[dep.spec] = blobUrls[dep.resolved];
                    }
                }
                try {
                    const result = Babel.transform(files[path], {
                        filename: path,
                        sourceType: 'module',
                        compact: false,
                        presets: [
                            [
                                'typescript',
                                {
                                    isTSX:
                                        path.endsWith('.tsx') ||
                                        path.endsWith('.jsx'),
                                    allExtensions: true,
                                    allowDeclareFields: true,
                                    onlyRemoveTypeImports: true,
                                },
                            ],
                            [
                                'react',
                                {
                                    runtime: 'automatic',
                                    // Make the auto-injected jsx-runtime import
                                    // resolve directly to esm.sh — no rewriting
                                    // needed downstream.
                                    importSource: ESM + '/react@' + REACT_VERSION,
                                },
                            ],
                        ],
                        plugins: [buildRewritePlugin(specMap)],
                    });
                    blobUrls[path] = makeBlobURL(result.code as string);
                } catch (err: any) {
                    showError(
                        'Compile error in ' +
                            path +
                            ': ' +
                            (err && err.message ? err.message : String(err)),
                    );
                    return;
                }
            }

            const entryURL = blobUrls[entryPath];
            if (!entryURL) {
                showError(
                    'Entry file ' + entryPath + ' could not be compiled.',
                );
                return;
            }

            // ── Phase 5: mount the entry component ─────────────────────────
            const reactURL = externalURL('react');
            const reactDOMClientURL = externalURL('react-dom/client');
            const mountSrc =
                "import * as React from '" +
                reactURL +
                "';\n" +
                "import { createRoot } from '" +
                reactDOMClientURL +
                "';\n" +
                "import * as Entry from '" +
                entryURL +
                "';\n" +
                'try {\n' +
                '  const Component = Entry.default;\n' +
                "  if (!Component) throw new Error('No default export from " +
                entryPath +
                ". Use \\'export default function Page() {}\\'.');\n" +
                "  const rootEl = document.getElementById('root');\n" +
                "  if (!rootEl) throw new Error('Preview root element missing');\n" +
                '  const root = createRoot(rootEl);\n' +
                '  root.render(React.createElement(Component));\n' +
                '} catch (err) {\n' +
                '  const t = (err && err.message ? err.message : String(err))\n' +
                "    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');\n" +
                "  document.body.insertAdjacentHTML('afterbegin', '<div class=\"builder-error\">' + t + '</div>');\n" +
                '}\n';

            const mountURL = makeBlobURL(mountSrc);
            const s = document.createElement('script');
            s.type = 'module';
            s.src = mountURL;
            s.onerror = () => showError('Failed to load entry module.');
            document.body.appendChild(s);
        })
        .catch((err) => showError(err));
    /* eslint-enable @typescript-eslint/no-explicit-any */
}

const RUNTIME_SOURCE = '(' + builderRuntime.toString() + ')();';

const PREVIEW_TEMPLATE = (files: BuilderFiles, entryPath: string) => {
    const filesJSON = jsonForScript(files);
    const entryJSON = jsonForScript(entryPath);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
    <style>
      html, body, #root { height: 100%; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
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
    <script id="builder-files" type="application/json">${filesJSON}</script>
    <script>window.__BUILDER_ENTRY__ = ${entryJSON};</script>
    <script>${RUNTIME_SOURCE}</script>
  </body>
</html>`;
};
