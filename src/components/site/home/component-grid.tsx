import { Link } from '@tanstack/react-router';
import { categoryNames, visible } from '@/content';
import { Badge } from '@/components/ui/badge';
import { ComponentPreview } from './previews';

/** Every published registry component, each card showing the real thing. */
export function ComponentGrid() {
  return (
    <ul
      aria-label="Components"
      className="grid list-none gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3"
    >
      {visible().map((item) => (
        <li key={item.slug} className="bg-background">
          <Link
            to="/components/$slug"
            params={{ slug: item.slug }}
            className="group flex h-full flex-col p-5 transition-colors hover:bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <div
              aria-hidden="true"
              className="mb-5 flex h-36 items-center justify-center overflow-hidden border border-border bg-card px-3"
            >
              <ComponentPreview slug={item.slug} />
            </div>
            <Badge
              variant="outline"
              className="rounded-none font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >
              {categoryNames[item.category]}
            </Badge>
            <h3 className="mt-3 font-display text-xl font-bold transition-colors group-hover:text-primary">
              {item.name}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
