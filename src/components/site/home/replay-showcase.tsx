import { useEffect, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { type ReplayCircuit, circuitForRace } from '@/data/circuit-for-race';
import { formatRaceDate, latestRace } from '@/data/replay-index';
import type { ReplayRace } from '@/data/replay-schema';
import { REPLAY_TICK_MS, useRaceReplay } from '@/data/use-race-replay';
import { useReplayIndex, useReplayRace } from '@/data/use-replay-data';
import { TrackMap } from '@/registry/boxbox/ui/track-map';
import { Button } from '@/components/ui/button';

/** Fast enough that a grand prix loops in a couple of minutes, which is what a teaser needs. */
const SHOWCASE_SPEED = 20;

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center border border-border bg-card text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** `width / height` of a `viewBox`, so the map can be sized from the fixed height it is given. */
function viewBoxRatio(viewBox: string): number {
  const [, , width, height] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return width && height && Number.isFinite(width / height) ? width / height : 1000 / 600;
}

/**
 * The ticking half, kept apart from the race line and the button: the clock renders this ten
 * times a second and nothing above it needs to follow.
 */
function ReplayMap({ race, circuit }: { race: ReplayRace; circuit: ReplayCircuit }) {
  const replay = useRaceReplay(race, {
    speed: SHOWCASE_SPEED,
    autoPlay: true,
    pit: circuit.pit,
  });

  // No controls means no way back to the start, so the chequered flag rewinds it. `restart`
  // restores `autoPlay`, so the next lap begins on its own.
  const { finished, restart } = replay;
  useEffect(() => {
    if (finished) restart();
  }, [finished, restart]);

  return (
    <figure className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="h-full max-w-full" style={{ aspectRatio: viewBoxRatio(circuit.viewBox) }}>
          <TrackMap
            // A new outline restarts the markers, so their lap counters do not carry over.
            key={circuit.name}
            path={circuit.d}
            pitLane={circuit.pit.d}
            viewBox={circuit.viewBox}
            markers={replay.markers}
            transitionMs={replay.jumped ? 0 : REPLAY_TICK_MS}
          />
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        {`${circuit.name}, ${circuit.real ? 'unofficial layout' : 'an invented circuit'}. `}
        Race data from jolpica-f1; positions are interpolated from lap times, not real telemetry.
      </figcaption>
    </figure>
  );
}

/**
 * The newest curated race, playing itself on its circuit. Loaded lazily by `ReplaySection`, so
 * the race file and the circuit outlines stay out of the home page's first bundle.
 */
export default function ReplayShowcase() {
  const index = useReplayIndex();
  const entry = useMemo(() => latestRace(index.data?.races ?? []), [index.data]);
  const race = useReplayRace(entry?.id);
  const circuit = useMemo(
    () => (race.data ? circuitForRace(race.data.circuit) : undefined),
    [race.data],
  );

  // No retry button here: the home page is not the place to ask a visitor to fix a failed fetch.
  if (index.status === 'error' || race.status === 'error') {
    return <Quiet>The replay is unavailable right now.</Quiet>;
  }
  if (!entry || !race.data || !circuit) return <Quiet>Loading the latest race…</Quiet>;

  return (
    <div className="flex h-full flex-col gap-4 border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{entry.name}</span>
          {` · ${entry.circuit} · ${formatRaceDate(entry.date)}`}
        </p>
        <Button size="sm" asChild>
          <Link to="/replay" search={{ season: entry.season, round: entry.round }}>
            Watch the replay <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <ReplayMap race={race.data} circuit={circuit} />
    </div>
  );
}
