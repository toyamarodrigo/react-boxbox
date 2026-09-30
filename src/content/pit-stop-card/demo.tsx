import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { grid } from '@/data/grid';
import type { TyreCompound } from '@/registry/boxbox/lib/types';
import { PitStopCard } from '@/registry/boxbox/ui/pit-stop-card';
import type { ControlValues } from '../types';
import type controls from './controls';

/** Two invented stops the demo runs in turn: lane times in seconds, positions in and out. */
const STOPS: {
  stop: number;
  off: TyreCompound;
  on: TyreCompound;
  laneTime: number;
  positionIn: number;
  positionOut: number;
}[] = [
  { stop: 1, off: 'M', on: 'H', laneTime: 22.4, positionIn: 3, positionOut: 6 },
  { stop: 2, off: 'H', on: 'S', laneTime: 21.7, positionIn: 4, positionOut: 5 },
];

/** Seconds the finished stop stays up, then seconds with no card before the next one. */
const HOLD = 4;
const GAP = 1.5;
const TICK_MS = 100;
const PLAYBACK = { '1x': 1, '2x': 2, '4x': 4 } as const;

const teamsById = Object.fromEntries(grid.teams.map((team) => [team.id, team]));

export default function PitStopCardDemo({
  code,
  showTyres,
  size,
  playback,
}: ControlValues<typeof controls.fields>) {
  // `t` is seconds since the car entered the lane, on the stop's own clock.
  const [run, setRun] = useState({ index: 0, t: 0 });
  const rate = PLAYBACK[playback];

  useEffect(() => {
    const id = setInterval(() => {
      setRun(({ index, t }) => {
        const stop = STOPS[index % STOPS.length]!;
        const next = t + (TICK_MS / 1000) * rate;
        return next >= stop.laneTime + HOLD + GAP ? { index: index + 1, t: 0 } : { index, t: next };
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [rate]);

  const driver = grid.drivers.find((entry) => entry.code === code) ?? grid.drivers[0]!;
  const stop = STOPS[run.index % STOPS.length]!;
  const out = run.t >= stop.laneTime;

  return (
    // A fixed height, so the page does not jump while no card is up.
    <div className="flex h-36 items-center justify-center">
      <AnimatePresence>
        {run.t < stop.laneTime + HOLD && (
          <PitStopCard
            key={run.index}
            code={driver.code}
            color={teamsById[driver.teamId]?.color}
            stop={stop.stop}
            laneTime={Math.min(run.t, stop.laneTime)}
            compoundOff={showTyres ? stop.off : undefined}
            compoundOn={showTyres ? stop.on : undefined}
            positionIn={stop.positionIn}
            positionOut={out ? stop.positionOut : undefined}
            size={size}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
