import { useMemo } from 'react';
import { drivers, teams } from '@/data/grid';
import type { GapChartSeries } from '@/registry/boxbox/ui/gap-chart';
import { GapChart } from '@/registry/boxbox/ui/gap-chart';
import type { ControlValues } from '../types';
import { useRaceLap } from '../stint-bar/use-race-lap';
import controls from './controls';

const TICK_MS = 260;

/** The invented cars this race is run with, in finishing order at the flag. */
const FIELD = ['EVO', 'MSO', 'TRE', 'NVA', 'AQU', 'SDA'] as const;

/**
 * A repeatable pseudo-random source: the demo must draw the same race on every render, and a
 * chart that reshuffles itself whenever a control moves is impossible to read.
 */
function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43_758.545_3;
  return value - Math.floor(value);
}

/**
 * An invented race as gaps to the leader: each car drifts away from the front at its own rate,
 * loses about twenty seconds to a pit stop somewhere in the middle, and wobbles by a tenth or two
 * a lap. The leader runs on zero. Nothing here is a real race or a real driver.
 */
function inventRace(totalLaps: number): GapChartSeries[] {
  return FIELD.map((code, index) => {
    const driver = drivers.find((entry) => entry.code === code);
    const color = teams.find((team) => team.id === driver?.teamId)?.color;
    const stopLap = Math.round(totalLaps * (0.35 + index * 0.06));
    const drift = index * 0.22;

    let gap = 0;
    const gaps: (number | null)[] = [];
    for (let lap = 1; lap <= totalLaps; lap++) {
      gap += index === 0 ? 0 : drift + (noise(index * 100 + lap) - 0.45) * 0.9;
      if (lap === stopLap) gap += 19 + index;
      if (lap === stopLap + 1 && index > 0) gap -= 2.5;
      // The last car has an engine failure with a quarter of the race left: no times after it.
      const out = index === FIELD.length - 1 && lap > Math.round(totalLaps * 0.75);
      gaps.push(out ? null : Math.max(0, Math.round(gap * 100) / 100));
    }

    return { id: driver?.id ?? code, code, color, gaps };
  });
}

export default function GapChartDemo({
  totalLaps,
  animate,
  currentLap,
  emphasised,
}: ControlValues<typeof controls.fields>) {
  const running = useRaceLap(totalLaps, TICK_MS, animate);
  const lap = animate ? running : Math.min(currentLap, totalLaps);
  const series = useMemo(() => inventRace(totalLaps), [totalLaps]);
  const emphasisedId = series.find((car) => car.code === emphasised)?.id;

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {`Lap ${lap} / ${totalLaps}`}
      </p>
      <GapChart
        series={series}
        totalLaps={totalLaps}
        currentLap={lap}
        emphasisedId={emphasisedId}
        className="h-72"
      />
    </div>
  );
}
