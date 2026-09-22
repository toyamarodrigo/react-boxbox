import { Suspense, lazy, useEffect, useRef, useState } from 'react';

/**
 * Everything the showcase needs — a race file, the replay clock, the Track Map and the circuit
 * outlines — is several hundred kilobytes that a visitor who never scrolls this far should not
 * pay for. The chunk is fetched only once the section comes into view.
 */
const ReplayShowcase = lazy(() => import('./replay-showcase'));

/** The slot keeps its height whether it holds the placeholder or the map, so nothing jumps. */
const SLOT_CLASS = 'mt-8 h-[30rem] md:h-[34rem]';

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center border border-border bg-card text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * True once the element has been on screen. Environments without the API — jsdom and the
 * prerender — have no scrolling to wait for, so they start visible.
 */
function useSeen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (seen || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setSeen(true);
      },
      // A little ahead of the fold, so the chunk is on its way before the section arrives.
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);

  return seen;
}

/** The Replay page on the home page: the newest curated race playing itself, with no controls. */
export function ReplaySection() {
  const slot = useRef<HTMLDivElement>(null);
  const seen = useSeen(slot);

  return (
    <section aria-labelledby="replay-heading" className="mt-24">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2
            id="replay-heading"
            className="font-display text-3xl font-black tracking-tight md:text-4xl"
          >
            Replay
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">The whole library in one race</p>
        </div>
      </div>
      <div ref={slot} className={SLOT_CLASS}>
        {seen ? (
          <Suspense fallback={<Placeholder>Loading the replay…</Placeholder>}>
            <ReplayShowcase />
          </Suspense>
        ) : (
          <Placeholder>Scroll down to play the latest race.</Placeholder>
        )}
      </div>
    </section>
  );
}
