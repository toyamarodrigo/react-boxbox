import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';

export const Route = createFileRoute('/')({ component: Home });

export function Home() {
  return (
    <div className="py-16 md:py-24">
      <p className="mb-5 text-xs font-bold uppercase tracking-[0.25em] text-primary">
        Race graphics for React
      </p>
      <h1 className="max-w-3xl font-display text-6xl font-black leading-[0.95] tracking-tight md:text-8xl">
        Every second
        <br />
        on screen.
      </h1>
      <p className="mt-8 max-w-xl text-lg text-muted-foreground">
        Broadcast-inspired components for timing, race control, and the pit lane. Built for React
        and distributed through the shadcn registry.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/docs/installation">
            Get started <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/components">Explore components</Link>
        </Button>
      </div>
      <div className="mt-20 grid gap-px border border-border bg-border sm:grid-cols-3">
        {[
          ['01', 'Install the theme'],
          ['02', 'Choose a component'],
          ['03', 'Make it yours'],
        ].map(([number, label]) => (
          <div key={number} className="bg-background p-6">
            <div className="font-mono text-xs text-primary">{number}</div>
            <div className="mt-3 font-display text-xl font-bold">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
