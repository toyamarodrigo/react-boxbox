import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { grid } from '@/data/grid';
import { BattleCard } from '@/registry/boxbox/ui/battle-card';
import type { ControlValues } from '../types';
import type controls from './controls';

/**
 * One invented battle, lap by lap: the car behind closes in, gets past, and the car it passed
 * falls away until the interval is too big to call it a battle. `swapped` is the order after the
 * pass. The first lap is the one the battle needs before it starts, so the card is not up yet.
 */
const LAPS: { interval: number; swapped: boolean }[] = [
  { interval: 0.94, swapped: false },
  { interval: 0.78, swapped: false },
  { interval: 0.61, swapped: false },
  { interval: 0.42, swapped: false },
  { interval: 0.25, swapped: false },
  { interval: 0.31, swapped: true },
  { interval: 0.64, swapped: true },
  { interval: 1.02, swapped: true },
  { interval: 1.38, swapped: true },
  { interval: 1.71, swapped: true },
];

/** The lap the battle starts on, and the lap it ends on: the interval grew past 1.5 s. */
const START = 1;
const END = LAPS.length - 1;
/** Laps with no card before the battle runs again. */
const REST_LAPS = 2;
/** Laps the trend is measured over, as the Replay page does. */
const TREND_LAPS = 3;

/** Seconds a lap takes at 1x: a real lap squeezed so the demo has something to show. */
const LAP_SECONDS = 3;
const TICK_MS = 100;
const PLAYBACK = { '1x': 1, '2x': 2, '4x': 4 } as const;

const teamsById = Object.fromEntries(grid.teams.map((team) => [team.id, team]));

/** The change per lap over the last laps run in the same order, or none on the lap of the pass. */
function trendAt(lap: number): number | null {
  const now = LAPS[lap]!;
  let first = lap;
  while (first > 0 && lap - first < TREND_LAPS && LAPS[first - 1]!.swapped === now.swapped) {
    first -= 1;
  }
  return first === lap ? null : (now.interval - LAPS[first]!.interval) / (lap - first);
}

export default function BattleCardDemo({
  pair,
  position,
  size,
  playback,
}: ControlValues<typeof controls.fields>) {
  // `t` is laps since the demo began this run, fractional between the lines.
  const [run, setRun] = useState({ index: 0, t: 0 });
  const rate = PLAYBACK[playback];

  useEffect(() => {
    const id = setInterval(() => {
      setRun(({ index, t }) => {
        const next = t + (TICK_MS / 1000 / LAP_SECONDS) * rate;
        return next >= LAPS.length + REST_LAPS ? { index: index + 1, t: 0 } : { index, t: next };
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [rate]);

  const car = (code: string) => {
    const driver = grid.drivers.find((entry) => entry.code === code) ?? grid.drivers[0]!;
    return { code: driver.code, color: teamsById[driver.teamId]?.color };
  };
  const [first, second] = pair.split('-') as [string, string];
  const lap = Math.floor(run.t);
  const line = LAPS[Math.min(lap, END)]!;
  // Between the lines the interval moves towards the next one, the way a timing screen's does.
  const next = LAPS[Math.min(lap + 1, END)]!;
  const interval =
    next.swapped === line.swapped
      ? line.interval + (next.interval - line.interval) * (run.t - lap)
      : line.interval;
  const [ahead, behind] = line.swapped ? [second, first] : [first, second];

  return (
    // A fixed height, so the page does not jump while no card is up.
    <div className="flex h-40 items-center justify-center">
      <AnimatePresence>
        {lap >= START && lap < END && (
          <BattleCard
            key={run.index}
            position={position}
            ahead={car(ahead)}
            behind={car(behind)}
            interval={interval}
            trend={trendAt(lap)}
            overtake={line.swapped && !LAPS[lap - 1]!.swapped}
            size={size}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
