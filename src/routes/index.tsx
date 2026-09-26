import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { ComponentGrid } from '../components/site/home/component-grid';
import { HeroSequence } from '../components/site/home/hero-sequence';
import { ReplaySection } from '../components/site/home/replay-section';
import { Button } from '../components/ui/button';

export const Route = createFileRoute('/')({ component: Home });

const steps = [
  ['01', 'Install the theme', 'One registry item brings the tokens, the fonts, and dark mode.'],
  ['02', 'Choose a component', 'Six broadcast pieces, each with a playground and its source.'],
  ['03', 'Make it yours', 'Own the code: semantic tokens, render slots, and named parts.'],
] as const;

function Home() {
  return (
    <div className="py-12 md:py-16">
      {/* The stage column is fixed so neither the lights nor the live tower can resize the layout. */}
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
        <div>
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.25em] text-primary">
            Race graphics for React
          </p>
          <h1 className="font-display text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
            Every second
            <br />
            on screen.
          </h1>
          <p className="mt-8 max-w-xl text-lg text-muted-foreground">
            Broadcast-inspired components for timing, race control, and the pit lane. Built for
            React and distributed through the shadcn registry.
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
        </div>
        <HeroSequence />
      </div>

      <div className="mt-20 grid gap-px border border-border bg-border sm:grid-cols-3">
        {steps.map(([number, label, detail]) => (
          <div key={number} className="bg-background p-6">
            <div className="font-mono text-xs text-primary">{number}</div>
            <div className="mt-3 font-display text-xl font-bold">{label}</div>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>

      <ReplaySection />

      <section aria-labelledby="library-heading" className="mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
          <h2
            id="library-heading"
            className="font-display text-3xl font-black tracking-tight md:text-4xl"
          >
            The library
          </h2>
          <Link
            to="/components"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            All components →
          </Link>
        </div>
        <div className="mt-8">
          <ComponentGrid />
        </div>
      </section>
    </div>
  );
}
