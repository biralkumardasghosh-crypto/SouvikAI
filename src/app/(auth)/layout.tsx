export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-3 md:p-4 safe-top safe-bottom">
            <div className="w-full max-w-md">
                {children}
            </div>
        </div>
    );
}