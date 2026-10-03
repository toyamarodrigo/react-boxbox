import { lazy, memo, Suspense, useMemo } from 'react';
import {
  type CompareLine,
  MAX_COMPARED,
  compareDifferences,
  compareStats,
  compareVisible,
  dashedDrivers,
  toggleCompared,
} from '@/data/replay-compare';
import type { ReplayRace, ReplayStint } from '@/data/replay-schema';
import { type PitLaneShape, carLapsAt } from '@/data/replay-timing';
import type { SpeedProfile } from '@/data/speed-profile';
import { cn } from '@/lib/utils';
import type { TimingRow } from '@/registry/boxbox/lib/types';
import { formatLapTime } from '@/registry/boxbox/ui/sector-times';
import { StintBar } from '@/registry/boxbox/ui/stint-bar';
import { Button } from '@/components/ui/button';

/** Recharts stays out of the page's first bundle here too: it arrives when the tab is opened. */
const CompareChart = lazy(() =>
  import('./compare-chart').then((module) => ({ default: module.CompareChart })),
);

const EMPTY = '—';

const NO_STINTS: readonly ReplayStint[] = [];

/**
 * The drivers to put next to the followed one, in the tower's order. Buttons like the page's other
 * pickers, so each says whether it is pressed; once three are chosen the rest wait until one goes.
 */
function ComparePicker({
  rows,
  codes,
  colors,
  followedId,
  comparedIds,
  onCompare,
}: {
  rows: readonly TimingRow[];
  codes: ReadonlyMap<string, string>;
  colors: ReadonlyMap<string, string>;
  followedId: string;
  comparedIds: readonly string[];
  onCompare: (ids: string[]) => void;
}) {
  const full = comparedIds.length >= MAX_COMPARED;
  return (
    <fieldset aria-label="Compared drivers" className="flex flex-wrap items-center gap-1">
      {rows.map((row) => {
        const code = codes.get(row.driverId);
        if (row.driverId === followedId || code === undefined) return null;
        const pressed = comparedIds.includes(row.driverId);
        return (
          <Button
            key={row.driverId}
            variant={pressed ? 'default' : 'outline'}
            size="sm"
            aria-pressed={pressed}
            disabled={full && !pressed}
            onClick={() => onCompare(toggleCompared(comparedIds, row.driverId))}
            className="font-mono text-[11px] font-bold tracking-wider"
          >
            <span
              aria-hidden
              className="h-3 w-[3px] shrink-0"
              style={{ backgroundColor: colors.get(row.driverId) ?? 'currentColor' }}
            />
            {code}
          </Button>
        );
      })}
    </fieldset>
  );
}

/**
 * One driver's figures under the chart. Memoised on the plain values it draws: the panel renders
 * ten times a second, and a row only changes when its car completes a lap.
 */
const CompareRow = memo(function CompareRow({
  driverId,
  code,
  color,
  dashed,
  followed,
  bestLapMs,
  bestLap,
  cleanPaceMs,
  cleanLaps,
  stops,
  stints,
  totalLaps,
  lap,
}: {
  driverId: string;
  code: string;
  color: string;
  dashed: boolean;
  followed: boolean;
  bestLapMs: number | null;
  bestLap: number | null;
  cleanPaceMs: number | null;
  cleanLaps: number;
  stops: number;
  stints: readonly ReplayStint[];
  totalLaps: number;
  lap: number;
}) {
  return (
    <tr
      data-slot="compare-row"
      data-driver={driverId}
      data-followed={followed ? 'true' : undefined}
      className={cn('border-b border-border/60 last:border-b-0', followed && 'bg-primary/10')}
    >
      <th scope="row" className="py-1.5 pr-3 pl-2 text-left font-normal">
        <span className="flex items-center gap-1.5">
          {/* The chart's own line: solid, or dashed for the second car of a team. */}
          <span
            aria-hidden
            className="w-4 shrink-0 border-t-2"
            style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}
          />
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider">{code}</span>
        </span>
      </th>
      <td data-slot="compare-best" className="py-1.5 pr-3 font-mono text-xs tabular-nums">
        {bestLapMs === null ? (
          EMPTY
        ) : (
          <>
            {formatLapTime(bestLapMs / 1000)}
            <span className="text-muted-foreground">{` L${bestLap}`}</span>
          </>
        )}
      </td>
      <td data-slot="compare-pace" className="py-1.5 pr-3 font-mono text-xs tabular-nums">
        {cleanPaceMs === null ? (
          EMPTY
        ) : (
          <>
            {formatLapTime(cleanPaceMs / 1000)}
            <span className="text-muted-foreground">{` ${cleanLaps} ${cleanLaps === 1 ? 'lap' : 'laps'}`}</span>
          </>
        )}
      </td>
      <td data-slot="compare-stops" className="py-1.5 pr-3 font-mono text-xs tabular-nums">
        {stops}
      </td>
      <td className="w-full min-w-24 py-1.5 pr-2">
        <StintBar size="sm" stints={stints} totalLaps={totalLaps} currentLap={lap} />
      </td>
    </tr>
  );
});

/**
 * The Compare tab: up to three compared drivers next to the followed driver, their cumulative
 * time difference to it lap by lap, and one row of figures each. Every figure is as of the race
 * time, like the Gap chart and the Lap grid, so the tab never shows a lap the clock has not run.
 */
export function Compare({
  race,
  rows,
  elapsedMs,
  finished,
  pit,
  profile,
  stints,
  followedId,
  comparedIds,
  onCompare,
}: {
  race: ReplayRace;
  /** The tower's rows, for the order of the picker. */
  rows: readonly TimingRow[];
  elapsedMs: number;
  /** At the flag every lap is shown, including a lapped car's, which ends after the leader's. */
  finished: boolean;
  pit: PitLaneShape | undefined;
  /** The circuit's speed profile, so the cars are where the tower and the Track Map put them. */
  profile: SpeedProfile | undefined;
  stints: ReadonlyMap<string, readonly ReplayStint[]>;
  followedId: string | undefined;
  comparedIds: readonly string[];
  onCompare: (ids: string[]) => void;
}) {
  const codes = useMemo(
    () => new Map(race.drivers.map((driver) => [driver.id, driver.code])),
    [race],
  );
  const colors = useMemo(() => {
    const teams = new Map(race.teams.map((team) => [team.id, team.color]));
    return new Map(race.drivers.map((driver) => [driver.id, teams.get(driver.teamId) ?? '']));
  }, [race]);

  /** The followed car first, then the compared ones, each with its whole race of points. */
  const whole = useMemo<CompareLine[]>(() => {
    if (followedId === undefined) return [];
    const ids = [followedId, ...comparedIds];
    const dashed = dashedDrivers(race, ids);
    return ids.map((id) => ({
      id,
      code: codes.get(id) ?? id,
      color: colors.get(id) || undefined,
      dashed: dashed.has(id),
      points: compareDifferences(race, followedId, id),
    }));
  }, [race, followedId, comparedIds, codes, colors]);

  // How many points of each line the clock has reached, as one string, so the lines the memoised
  // chart is handed only change when a car completes a lap.
  const reach = finished ? Number.POSITIVE_INFINITY : elapsedMs;
  const shown = whole.map((line) => compareVisible(line.points, reach)).join(',');
  const lines = useMemo(() => {
    const counts = shown.split(',').map(Number);
    return whole.map((line, index) => ({
      ...line,
      points: line.points.slice(0, counts[index] ?? 0),
    }));
  }, [whole, shown]);

  const cars = useMemo(
    () => carLapsAt(race, elapsedMs, pit, profile),
    [race, elapsedMs, pit, profile],
  );

  if (followedId === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Follow a driver first: click a row in the tower or a car on the map, then compare others
        with them here.
      </p>
    );
  }

  const followedCode = codes.get(followedId) ?? '';

  return (
    <div className="flex flex-col gap-3">
      <ComparePicker
        rows={rows}
        codes={codes}
        colors={colors}
        followedId={followedId}
        comparedIds={comparedIds}
        onCompare={onCompare}
      />
      {comparedIds.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {`Pick up to ${MAX_COMPARED} drivers to compare with ${followedCode}.`}
        </p>
      ) : (
        // The fallback holds the chart's height, so the panel does not jump when it lands.
        <Suspense fallback={<div aria-busy="true" className="h-64 md:h-80" />}>
          <CompareChart lines={lines} totalLaps={race.totalLaps} className="h-64 md:h-80" />
        </Suspense>
      )}
      <div className="overflow-x-auto">
        <table aria-label="Compared drivers' figures" className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="py-1 pr-3 pl-2 font-medium">
                Driver
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Best lap
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Clean pace
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Stops
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Stints
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const stats = compareStats(race, line.id, reach);
              const own = stints.get(line.id) ?? NO_STINTS;
              return (
                <CompareRow
                  key={line.id}
                  driverId={line.id}
                  code={line.code}
                  color={line.color ?? 'currentColor'}
                  dashed={line.dashed}
                  followed={line.id === followedId}
                  bestLapMs={stats.bestLapMs}
                  bestLap={stats.bestLap}
                  cleanPaceMs={stats.cleanPaceMs}
                  cleanLaps={stats.cleanLaps}
                  stops={stats.stops}
                  stints={own}
                  totalLaps={race.totalLaps}
                  // A car out of the race keeps the race it ran.
                  lap={cars.get(line.id)?.lap ?? own.at(-1)?.toLap ?? 0}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {`Time to ${followedCode} at the line, lap by lap, on each car's own laps: below zero is behind, above is ahead. Clean pace leaves out lap 1, pit in and out laps and neutralised laps, as the Lap grid does.`}
      </p>
    </div>
  );
}
