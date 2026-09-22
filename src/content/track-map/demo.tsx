import { useMemo } from 'react';
import { CIRCUITS } from '@/data/circuits';
import { grid } from '@/data/grid';
import type { TrackMarker, TrackSector, TrackStatus } from '@/registry/boxbox/lib/types';
import { TrackMap } from '@/registry/boxbox/ui/track-map';
import type { ControlValues } from '../types';
import { FICTIONAL_CIRCUIT, FICTIONAL_SECTORS } from './circuit';
import controls from './controls';
import { useTrackProgress } from './use-track-progress';

const TICK_MS = 240;

const teamColor = (teamId: string) =>
  grid.teams.find((team) => team.id === teamId)?.color ?? 'currentColor';

function withStatus(sector: TrackSector, status: string): TrackSector {
  return status === 'none' ? sector : { ...sector, status: status as TrackStatus };
}

/** The invented circuit is the fallback, so an unknown selection never breaks the map. */
function circuitAt(location: string) {
  const real = CIRCUITS.find((circuit) => circuit.location === location);
  return real
    ? {
        d: real.d,
        pit: real.pit,
        viewBox: real.viewBox,
        name: real.name,
        caption: 'unofficial layout, approximate pit lane',
      }
    : { ...FICTIONAL_CIRCUIT, caption: 'an invented circuit' };
}

export default function TrackMapDemo({
  circuit,
  sector1,
  sector2,
  sector3,
  cars,
  showCodes,
  size,
  animate,
}: ControlValues<typeof controls.fields>) {
  const progress = useTrackProgress(cars, TICK_MS, animate);
  const layout = circuitAt(circuit);

  const sectors = useMemo<TrackSector[]>(
    () =>
      [sector1, sector2, sector3].map((status, index) =>
        withStatus(FICTIONAL_SECTORS[index]!, status),
      ),
    [sector1, sector2, sector3],
  );

  const markers = useMemo<TrackMarker[]>(
    () =>
      grid.drivers.slice(0, cars).map((driver, index) => ({
        id: driver.id,
        // The leader is emphasised, the way a broadcast graphic picks one car out.
        emphasis: index === 0,
        progress: progress[index] ?? 0,
        color: teamColor(driver.teamId),
        code: showCodes ? driver.code : undefined,
      })),
    [cars, progress, showCodes],
  );

  return (
    <figure className="w-full max-w-2xl">
      <TrackMap
        // A new outline restarts the markers, so their lap counters do not carry over.
        key={layout.name}
        path={layout.d}
        pitLane={layout.pit.d}
        viewBox={layout.viewBox}
        sectors={sectors}
        markers={markers}
        size={size}
        transitionMs={TICK_MS}
      />
      <figcaption className="mt-3 text-center font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {layout.name} · {layout.caption}
      </figcaption>
    </figure>
  );
}
