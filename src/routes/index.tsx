import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Home });

export function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground font-display">
      <h1 className="text-5xl font-bold tracking-tight">boxbox</h1>
      <p className="mt-4 text-sm text-muted-foreground">Animated race components, coming soon.</p>
    </main>
  );
}
