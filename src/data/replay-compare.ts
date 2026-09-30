import type { ReplayRace } from './replay-schema';
import { lapGrid, lapGridVisible } from './replay-lap-grid';
import { followedDriverId } from './replay-timing';

/**
 * Compare: up to three compared drivers next to the followed driver, every figure measured
 * against the followed driver and never between compared drivers. Everything here is pure; the
 * clock only decides how much of each line or figure the page may show, so nothing gives away a
 * part of the race the viewer has not reached.
 */

/** How many drivers can be compared with the followed driver at once. */
export const MAX_COMPARED = 3;

/**
 * The compared drivers a `vs` search names, as driver ids in the order given. Forgiving, like the
 * rest of the search: codes in any case, unknown ones and repeats dropped, the followed driver's
 * own code dropped (nobody is compared with themselves), and anything past three cut. There is no
 * compared driver without a followed driver, so without one the list is empty.
 */
export function comparedDriverIds(
  race: ReplayRace,
  vs: string | undefined,
  followedId: string | undefined,
): string[] {
  if (vs === undefined || followedId === undefined) return [];
  const ids: string[] = [];
  for (const part of vs.split(',')) {
    const id = followedDriverId(race, part.trim());
    if (id === undefined || id === followedId || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length === MAX_COMPARED) break;
  }
  return ids;
}

/** The `vs` search for a list of compared drivers: their codes, comma-separated; none is absent. */
export function comparedSearch(race: ReplayRace, ids: readonly string[]): string | undefined {
  const codes = ids.flatMap((id) => race.drivers.find((driver) => driver.id === id)?.code ?? []);
  return codes.length === 0 ? undefined : codes.join(',');
}

/** Adds a driver to the compared ones, or takes it out if it is there. A fourth is refused. */
export function toggleCompared(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((entry) => entry !== id);
  return ids.length >= MAX_COMPARED ? [...ids] : [...ids, id];
}

/**
 * The cars drawn dashed: teammates share a colour, so the second car of a team among `ids` (the
 * followed driver first, then the compared ones) is told apart by its line instead.
 */
export function dashedDrivers(race: ReplayRace, ids: readonly string[]): Set<string> {
  const teams = new Set<string>();
  const dashed = new Set<string>();
  for (const id of ids) {
    const team = race.drivers.find((driver) => driver.id === id)?.teamId;
    if (team === undefined) continue;
    if (teams.has(team)) dashed.add(id);
    teams.add(team);
  }
  return dashed;
}

/**
 * One lap of a compared line: how many seconds the car crossed the line after the followed car at
 * the end of `lap` (negative when it crossed first), and `at`, the race time the later of the two
 * crossed it, which is when the point may be drawn.
 */
export type CompareDifference = { lap: number; seconds: number; at: number };

const CUMULATIVES = new WeakMap<ReplayRace, Map<string, Map<number, number>>>();

/** Every car's race time at the end of each lap it completed, built once per race. */
function cumulatives(race: ReplayRace): Map<string, Map<number, number>> {
  const cached = CUMULATIVES.get(race);
  if (cached) return cached;
  const byDriver = new Map<string, Map<number, number>>();
  for (const entry of race.laps) {
    for (const row of entry.rows) {
      if (row.cumulativeMs === null) continue;
      const own = byDriver.get(row.driverId) ?? new Map<number, number>();
      own.set(entry.lap, row.cumulativeMs);
      byDriver.set(row.driverId, own);
    }
  }
  CUMULATIVES.set(race, byDriver);
  return byDriver;
}

/**
 * A car's cumulative time difference to the followed car, lap by lap: its own lap count against
 * the followed car's, so a lapped car is a lap's worth behind rather than level with the car it
 * is next to on the road. Only laps both cars completed are points; a retired car's line stops
 * at its last lap, and so does every line when the followed car retires. For the followed car
 * itself every point is zero.
 */
export function compareDifferences(
  race: ReplayRace,
  followedId: string,
  driverId: string,
): CompareDifference[] {
  const all = cumulatives(race);
  const followed = all.get(followedId);
  const own = all.get(driverId);
  if (followed === undefined || own === undefined) return [];
  const points: CompareDifference[] = [];
  for (const [lap, ms] of [...own].sort(([a], [b]) => a - b)) {
    const reference = followed.get(lap);
    if (reference === undefined) continue;
    points.push({ lap, seconds: (ms - reference) / 1000, at: Math.max(ms, reference) });
  }
  return points;
}

/** How many of a line's points the clock has reached, by binary search: `at` only grows. */
export function compareVisible(points: readonly CompareDifference[], elapsedMs: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((points[mid]?.at ?? 0) <= elapsedMs) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** One car's row under the chart, as of the race time it is read at. */
export type CompareStats = {
  /** The fastest lap completed so far, every lap included, as the official fastest lap is. */
  bestLapMs: number | null;
  bestLap: number | null;
  /** The mean of the clean laps so far: the Lap grid's counted laps. */
  cleanPaceMs: number | null;
  cleanLaps: number;
  /** Stops made so far, counted on the laps the car came in on. */
  stops: number;
};

/**
 * A car's best lap, mean clean-lap pace and stops, from the laps it completed by `elapsedMs`
 * (`Infinity` for the whole race). Clean means what the Lap grid counts: not lap 1, not a lap into
 * or out of a stop, not a lap that touched a neutralisation. Read off the Lap grid's own cells, so
 * the two can never disagree about which laps count.
 */
export function compareStats(race: ReplayRace, driverId: string, elapsedMs: number): CompareStats {
  const cells = lapGrid(race, 'lap').get(driverId) ?? [];
  const run = cells.slice(0, lapGridVisible(cells, elapsedMs));
  let best: { ms: number; lap: number } | undefined;
  let cleanTotal = 0;
  let cleanLaps = 0;
  let stops = 0;
  for (const cell of run) {
    if (cell.reasons.includes('in-lap')) stops++;
    if (cell.ms === null) continue;
    if (best === undefined || cell.ms < best.ms) best = { ms: cell.ms, lap: cell.lap };
    if (cell.reasons.length === 0) {
      cleanTotal += cell.ms;
      cleanLaps++;
    }
  }
  return {
    bestLapMs: best?.ms ?? null,
    bestLap: best?.lap ?? null,
    cleanPaceMs: cleanLaps === 0 ? null : Math.round(cleanTotal / cleanLaps),
    cleanLaps,
    stops,
  };
}

/** A time difference the way the tower writes a gap, signed both ways: `+1.2`, `−0.8`, `0.0`. */
export function formatDifference(seconds: number): string {
  const tenths = Math.round(seconds * 10) / 10;
  if (tenths === 0) return '0.0';
  return `${tenths > 0 ? '+' : '−'}${Math.abs(tenths).toFixed(1)}`;
}

/**
 * One line of the Compare chart, the points already cut to the race time. The followed car's is
 * the first line, on zero.
 */
export type CompareLine = {
  id: string;
  code: string;
  color?: string;
  /** The second car of a team, which shares its teammate's colour. */
  dashed: boolean;
  points: readonly CompareDifference[];
};

/** A row of the chart: `lap` plus one difference per car, keyed by car id. */
export type CompareChartRow = Record<string, number | null>;

/**
 * The lines turned into the one row per lap Recharts draws from, up to the last lap any line
 * reached, rounded to a tenth as the tower reads a gap. A lap a car has no point for is `null`,
 * so its line breaks or stops there rather than joining across it.
 */
export function compareChartRows(lines: readonly CompareLine[]): CompareChartRow[] {
  const last = Math.max(0, ...lines.map((line) => line.points.at(-1)?.lap ?? 0));
  const rows: CompareChartRow[] = Array.from({ length: last }, (_, index) => {
    const row: CompareChartRow = { lap: index + 1 };
    for (const line of lines) row[line.id] = null;
    return row;
  });
  for (const line of lines) {
    for (const point of line.points) {
      const row = rows[point.lap - 1];
      if (row) row[line.id] = Math.round(point.seconds * 10) / 10;
    }
  }
  return rows;
}

/**
 * The y range: always holding the followed car's zero, whole seconds either side, and at least a
 * second tall so two cars running together do not draw on a flat line.
 */
export function compareChartDomain(lines: readonly CompareLine[]): [number, number] {
  let low = 0;
  let high = 0;
  for (const line of lines) {
    for (const point of line.points) {
      low = Math.min(low, point.seconds);
      high = Math.max(high, point.seconds);
    }
  }
  const floor = Math.floor(low);
  return [floor, Math.max(floor + 1, Math.ceil(high))];
}

/**
 * The sentence a screen reader hears instead of the lines: whose time they are measured against,
 * how much of the race is drawn, and where each compared car stands at its last lap shown.
 */
export function compareChartLabel(lines: readonly CompareLine[], totalLaps: number): string {
  const [followed, ...compared] = lines;
  if (followed === undefined) return 'Time difference. No driver followed.';
  const laps = followed.points.length;
  const head = `Time difference to ${followed.code}`;
  if (laps === 0) return `${head}. No laps completed of ${totalLaps}.`;
  const scope = laps >= totalLaps ? `all ${totalLaps} laps` : `${laps} of ${totalLaps} laps`;
  const cars = compared.map((line) => {
    const point = line.points.at(-1);
    if (point === undefined) return `${line.code} has no lap yet.`;
    const tenths = Math.round(point.seconds * 10) / 10;
    if (tenths === 0) return `${line.code} level at lap ${point.lap}.`;
    const side = tenths > 0 ? 'behind' : 'ahead';
    return `${line.code} ${Math.abs(tenths).toFixed(1)} seconds ${side} at lap ${point.lap}.`;
  });
  return [`${head} over ${scope}.`, ...cars].join(' ');
}
