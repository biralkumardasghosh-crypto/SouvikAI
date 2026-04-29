import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui';

export const metadata: Metadata = {
    title: "Souvik's AI",
    description: 'A fast, private AI chat assistant.',
};

export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#0f0f0f' },
    ],
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html
            lang="en"
            className={`${GeistSans.variable} ${GeistMono.variable} bg-background`}
            suppressHydrationWarning
        >
            <body className="font-sans antialiased min-h-screen bg-background text-foreground">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem
                    disableTransitionOnChange
                >
                    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
                        <AuthProvider>{children}</AuthProvider>
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
