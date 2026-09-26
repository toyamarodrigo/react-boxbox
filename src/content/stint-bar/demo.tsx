import { useMemo } from 'react';
import { drivers, teams } from '@/data/grid';
import type { StintBarStint } from '@/registry/boxbox/ui/stint-bar';
import { StintBar } from '@/registry/boxbox/ui/stint-bar';
import type { ControlValues } from '../types';
import controls from './controls';
import { useRaceLap } from './use-race-lap';

const TICK_MS = 240;

/**
 * Four invented strategies, written as the share of the race each stop falls at so they still
 * make sense when the distance changes. The last car's first set has no compound: the grey case.
 */
const STRATEGIES: { stops: number[]; compounds: (StintBarStint['compound'] | undefined)[] }[] = [
  { stops: [0.32, 0.7], compounds: ['M', 'H', 'S'] },
  { stops: [0.45], compounds: ['M', 'H'] },
  { stops: [0.22, 0.52, 0.82], compounds: ['S', 'M', 'M', 'S'] },
  { stops: [0.4], compounds: [null, 'H'] },
];

function stintsFor(strategy: (typeof STRATEGIES)[number], totalLaps: number): StintBarStint[] {
  const cuts = [...new Set(strategy.stops.map((share) => Math.round(share * totalLaps)))]
    .filter((lap) => lap >= 1 && lap < totalLaps)
    .sort((a, b) => a - b);

  const stints: StintBarStint[] = [];
  let fromLap = 1;
  for (const [index, cut] of [...cuts, totalLaps].entries()) {
    stints.push({ fromLap, toLap: cut, compound: strategy.compounds[index] ?? null });
    fromLap = cut + 1;
  }
  return stints;
}

export default function StintBarDemo({
  totalLaps,
  showCurrentLap,
  animate,
  currentLap,
  size,
}: ControlValues<typeof controls.fields>) {
  const running = useRaceLap(totalLaps, TICK_MS, animate);
  const lap = animate ? running : Math.min(currentLap, totalLaps);

  const cars = useMemo(
    () =>
      STRATEGIES.map((strategy, index) => {
        const driver = drivers[index];
        return {
          id: driver?.id ?? String(index),
          code: driver?.code ?? '???',
          color: teams.find((team) => team.id === driver?.teamId)?.color ?? 'currentColor',
          stints: stintsFor(strategy, totalLaps),
        };
      }),
    [totalLaps],
  );

  return (
    <div className="w-full max-w-md">
      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {showCurrentLap ? `Lap ${lap} / ${totalLaps}` : `${totalLaps} laps`}
      </p>
      <ul aria-label="Strategy" className="flex list-none flex-col gap-2">
        {cars.map((car) => (
          <li key={car.id} className="flex items-center gap-3">
            <span className="w-9 font-display text-xs font-bold uppercase tracking-wider">
              {car.code}
            </span>
            <span aria-hidden className="h-4 w-[3px]" style={{ backgroundColor: car.color }} />
            <StintBar
              className="flex-1"
              stints={car.stints}
              totalLaps={totalLaps}
              currentLap={showCurrentLap ? lap : undefined}
              size={size}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
