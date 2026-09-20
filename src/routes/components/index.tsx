import { Link, createFileRoute } from '@tanstack/react-router';
import { categoryNames, visible } from '../../content';
import { Badge } from '../../components/ui/badge';

export const Route = createFileRoute('/components/')({ component: ComponentsIndex });

function ComponentsIndex() {
  const items = visible();
  return (
    <div>
      <div className="mb-10">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">Library</p>
        <h1 className="font-display text-5xl font-black tracking-tight">Components</h1>
        <p className="mt-4 text-muted-foreground">Building blocks for race broadcast interfaces.</p>
      </div>
      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.slug}
              to="/components/$slug"
              params={{ slug: item.slug }}
              className="border border-border bg-card p-6 transition-colors hover:border-primary"
            >
              <Badge variant="secondary">{categoryNames[item.category]}</Badge>
              <h2 className="mt-5 font-display text-2xl font-bold">{item.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="border border-border bg-card p-8">
          <p className="font-display text-2xl font-bold">The grid is forming.</p>
          <p className="mt-2 text-muted-foreground">
            Components are on the way. Start with the installation guide to prepare your project.
          </p>
          <Link
            to="/docs/installation"
            className="mt-4 inline-block text-sm font-bold text-primary"
          >
            Read installation →
          </Link>
        </div>
      )}
    </div>
  );
}
