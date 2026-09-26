import { useMemo } from 'react';

import type { Driver, ValueMode, Team, TimingRow } from '@/registry/boxbox/lib/types';
import type { PodiumEntry, PodiumSteps } from '@/registry/boxbox/ui/podium';
import { resultValue } from '@/registry/boxbox/ui/timing-tower';

/** The standard scoring table, first to tenth. Scoring is the demo's job, not the tower's. */
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

export function pointsForPosition(position: number): number | undefined {
  return POINTS[position - 1];
}

/** Adds the points a position scores. The simulator never leaves a car unclassified. */
export function withResultPoints(rows: readonly TimingRow[]): TimingRow[] {
  return rows.map((row) => ({
    ...row,
    points: pointsForPosition(row.position),
    finishStatus: 'finished' as const,
  }));
}

/** P1, P2 and P3, each with the value its tower row carries. Null while the field is short. */
export function podiumSteps(
  rows: readonly TimingRow[],
  drivers: Record<string, Driver>,
  teams: Record<string, Team>,
): PodiumSteps | null {
  const entries: PodiumEntry[] = [];
  for (const position of [1, 2, 3]) {
    const row = rows.find((item) => item.position === position);
    const driver = row ? drivers[row.driverId] : undefined;
    const team = driver ? teams[driver.teamId] : undefined;
    if (!row || !driver || !team) return null;
    entries.push({ driver, team, detail: resultValue(row, position === 1) });
  }
  const [first, second, third] = entries;
  return first && second && third ? [first, second, third] : null;
}

/**
 * What the demo shows once the race is over: the tower flips to `results`, the
 * rows carry points, and the podium gets its top three. Selecting `results` by
 * hand does the same thing, so the mode can be inspected before the last lap.
 */
export function useResultsPresentation({
  rows,
  mode,
  finished,
  drivers,
  teams,
}: {
  rows: readonly TimingRow[];
  mode: ValueMode;
  finished: boolean;
  drivers: Record<string, Driver>;
  teams: Record<string, Team>;
}): { mode: ValueMode; rows: TimingRow[]; podium: PodiumSteps | null } {
  const shownMode: ValueMode = finished ? 'results' : mode;
  return useMemo(() => {
    if (shownMode !== 'results') return { mode: shownMode, rows: [...rows], podium: null };
    const scored = withResultPoints(rows);
    return { mode: shownMode, rows: scored, podium: podiumSteps(scored, drivers, teams) };
  }, [shownMode, rows, drivers, teams]);
}
