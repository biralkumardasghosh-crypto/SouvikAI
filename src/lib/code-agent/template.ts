import type { BuilderFiles } from '@/types/code';

/**
 * The starter project the agent always begins with.
 *
 * Stack: Next.js 14 (App Router) + Tailwind CSS + TypeScript.
 *
 * The preview iframe compiles `app/page.tsx` against React/Tailwind via
 * Babel standalone, so the entry component should be self-contained
 * (no Next-specific imports beyond what's polyfilled).
 */
export const BASE_TEMPLATE: BuilderFiles = {
    'package.json': `{
  "name": "builder-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0"
  }
}
`,
    'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`,
    'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
`,
    'tailwind.config.ts': `import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
`,
    'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
    'app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 9%;
}

body {
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}
`,
    'app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My App',
  description: 'Built with Builder',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    'app/page.tsx': `export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-neutral-900">
          Welcome to your project
        </h1>
        <p className="mt-3 text-neutral-600">
          Start chatting on the left to build something amazing.
        </p>
      </div>
    </main>
  );
}
`,
    'README.md': `# Builder Project

A starter Next.js + Tailwind project. Edit \`app/page.tsx\` (or ask the agent to)
and watch your app come to life in the Preview tab.
`,
};

/** Returns a fresh deep copy of the template so callers can safely mutate. */
export function cloneBaseTemplate(): BuilderFiles {
    return { ...BASE_TEMPLATE };
}

/** Default file to show in the editor when a new session is created. */
export const DEFAULT_ACTIVE_FILE = 'app/page.tsx';
