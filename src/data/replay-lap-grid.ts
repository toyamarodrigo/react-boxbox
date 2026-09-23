import { formatLapTime, formatSectorTime } from '@/registry/boxbox/ui/sector-times';
import type { ReplayRace } from './replay-schema';
import { type NeutralisationStatus, neutralisationPeriods } from './replay-timing';

/**
 * The Lap grid: every car's laps as cells, one row per car and one column per lap of that car,
 * for the lap time or one sector. Everything here is pure and depends on the race and the measure
 * alone — the clock only decides how many cells of a row are drawn — so a grid is built once per
 * race and measure and looked up by identity afterwards, while the page renders ten times a second.
 *
 * A cell is judged as of the lap it was set, the way a timing screen colours a lap when it is
 * completed and never repaints it: `fastest` is the best of the race among every counted lap
 * completed at or before this one, `personal` the same for the car alone, and anything else is
 * `slower` by its delta to the car's personal best at that moment. Laps that are not pace are
 * `excluded` and never count as a best.
 */

export const LAP_GRID_MEASURES = ['lap', 's1', 's2', 's3'] as const;
export type LapGridMeasure = (typeof LAP_GRID_MEASURES)[number];

/**
 * Why a lap is not pace: the standing start, the laps into and out of a stop, and anything run
 * while the race was neutralised.
 */
export type LapGridExclusion = 'first-lap' | 'in-lap' | 'out-lap' | NeutralisationStatus;

export type LapGridStatus = 'fastest' | 'personal' | 'slower' | 'excluded' | 'unset';

export type LapGridCell = {
  lap: number;
  /** The lap or sector time in milliseconds; `null` where the source has none. */
  ms: number | null;
  status: LapGridStatus;
  /** How far off the car's personal best at that moment, in milliseconds: `slower` only. */
  deltaMs: number | null;
  /** Why the lap does not count, every reason that applies; empty unless `excluded`. */
  reasons: readonly LapGridExclusion[];
  /** When the car completed the lap on the race clock, which is when the cell may be drawn. */
  at: number;
};

/** A car's cells in lap order, by driver id. */
export type LapGrid = ReadonlyMap<string, readonly LapGridCell[]>;

/** Where the ramp stops getting deeper: anything slower than this reads as the same colour. */
export const LAP_GRID_DELTA_CAP_MS = 3000;

/** The measure's figure on a lap row. */
function figure(
  row: ReplayRace['laps'][number]['rows'][number],
  measure: LapGridMeasure,
): number | null {
  if (measure === 'lap') return row.lapTimeMs;
  return row.sectorMs[LAP_GRID_MEASURES.indexOf(measure) - 1] ?? null;
}

/**
 * The order a cell names its reasons in. Every reason that applies is kept rather than the first
 * one: São Paulo 2024 changed tyres under its red flag, so the lap that holds the whole 25-minute
 * stoppage is also every car's out-lap, and naming only one of the two would hide the other.
 */
const NEUTRALISATION_ORDER: readonly NeutralisationStatus[] = ['red', 'sc', 'vsc'];

/** A counted lap's reasons: one shared empty list rather than a fresh one per cell. */
const COUNTED: readonly LapGridExclusion[] = [];

const GRIDS = new WeakMap<ReplayRace, Map<LapGridMeasure, LapGrid>>();

/**
 * Every car's cells for one measure. Built once per race and measure; the same map comes back on
 * every call, so a memoised consumer is never woken by a fresh one.
 *
 * A lap is placed on the race clock by the car's own cumulative time, from its end minus its lap
 * time to its end, and it overlaps a neutralisation when any part of that window falls inside one
 * of the periods `neutralisationPeriods` gives the timeline — the same list, so the grid and the
 * bands can never disagree. A lap row the source has no cumulative time for cannot be placed and
 * has no cell (the curated races have none).
 */
export function lapGrid(race: ReplayRace, measure: LapGridMeasure): LapGrid {
  let byMeasure = GRIDS.get(race);
  if (byMeasure === undefined) {
    byMeasure = new Map();
    GRIDS.set(race, byMeasure);
  }
  const cached = byMeasure.get(measure);
  if (cached) return cached;

  const periods = neutralisationPeriods(race);
  const grid = new Map<string, LapGridCell[]>();
  /** The last lap each car stopped on: the lap after it is that car's out-lap. */
  const stoppedBefore = new Map<string, number>();

  for (const entry of race.laps) {
    for (const row of entry.rows) {
      const outLap = stoppedBefore.get(row.driverId) === entry.lap - 1;
      if (row.pitStop !== null) stoppedBefore.set(row.driverId, entry.lap);
      if (row.cumulativeMs === null) continue;

      const end = row.cumulativeMs;
      const start = end - (row.lapTimeMs ?? 0);
      const reasons: LapGridExclusion[] = [];
      if (entry.lap === 1) reasons.push('first-lap');
      if (row.pitStop !== null) reasons.push('in-lap');
      if (outLap) reasons.push('out-lap');
      for (const status of NEUTRALISATION_ORDER) {
        const overlaps = periods.some(
          (period) => period.status === status && start < period.toMs && end > period.fromMs,
        );
        if (overlaps) reasons.push(status);
      }

      const ms = figure(row, measure);
      const cells = grid.get(row.driverId) ?? [];
      cells.push({
        lap: entry.lap,
        ms,
        status: reasons.length > 0 ? 'excluded' : ms === null ? 'unset' : 'slower',
        deltaMs: null,
        reasons: reasons.length > 0 ? reasons : COUNTED,
        at: end,
      });
      grid.set(row.driverId, cells);
    }
  }

  judge(grid);
  byMeasure.set(measure, grid);
  return grid;
}

/**
 * Walks every counted cell in race-clock order, keeping the best of the race and of each car, and
 * colours each cell against the bests as they stood when it was set, itself included — so a lap
 * that *is* the best reads as the best, and two cars on the same time are both the fastest, which
 * is what `sectorStatusesAt` does with a tie.
 */
function judge(grid: Map<string, LapGridCell[]>): void {
  const counted: { driverId: string; cell: LapGridCell; ms: number }[] = [];
  for (const [driverId, cells] of grid) {
    for (const cell of cells) {
      // Every counted cell still reads `slower` here, which is what this pass is about to judge.
      if (cell.status !== 'slower' || cell.ms === null) continue;
      counted.push({ driverId, cell, ms: cell.ms });
    }
  }
  counted.sort((a, b) => a.cell.at - b.cell.at);

  let raceBest = Number.POSITIVE_INFINITY;
  const carBests = new Map<string, number>();
  for (const { driverId, cell, ms } of counted) {
    const carBest = carBests.get(driverId) ?? Number.POSITIVE_INFINITY;
    raceBest = Math.min(raceBest, ms);
    carBests.set(driverId, Math.min(carBest, ms));
    if (ms <= raceBest) cell.status = 'fastest';
    else if (ms <= carBest) cell.status = 'personal';
    else cell.deltaMs = ms - carBest;
  }
}

/** How many of a car's cells the clock has reached: a cell is drawn once its lap is complete. */
export function lapGridVisible(cells: readonly LapGridCell[], elapsedMs: number): number {
  let low = 0;
  let high = cells.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((cells[mid]?.at ?? 0) <= elapsedMs) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** How deep a slower cell's ramp is, from 0 at its personal best to 1 at the cap and beyond. */
export function lapGridIntensity(deltaMs: number): number {
  return Math.min(Math.max(deltaMs, 0), LAP_GRID_DELTA_CAP_MS) / LAP_GRID_DELTA_CAP_MS;
}

/**
 * Whether any lap of the race carries a sector time. 2021-22 Abu Dhabi has none, and a sector
 * picker there would offer three grids of empty cells.
 */
export function hasSectorTimes(race: ReplayRace): boolean {
  return race.laps.some((lap) => lap.rows.some((row) => row.sectorMs.some((ms) => ms !== null)));
}

const MEASURE_NAMES: Record<LapGridMeasure, string> = {
  lap: 'lap',
  s1: 'S1',
  s2: 'S2',
  s3: 'S3',
};

export const LAP_GRID_EXCLUSION_NAMES: Record<LapGridExclusion, string> = {
  'first-lap': 'opening lap',
  'in-lap': 'in-lap',
  'out-lap': 'out-lap',
  sc: 'safety car',
  vsc: 'virtual safety car',
  red: 'red flag',
};

/** A figure the way the tower and the sector card write it: `1:32.418` for a lap, `28.123` else. */
function formatFigure(ms: number, measure: LapGridMeasure): string {
  return measure === 'lap' ? formatLapTime(ms / 1000) : formatSectorTime(ms / 1000);
}

/** `+0.412`, the delta the way a timing screen writes it. */
function formatDelta(ms: number): string {
  return `+${(ms / 1000).toFixed(3)}`;
}

/**
 * The cell's tooltip: "Lap 23 · 1:32.418 · +0.412 to PB", the colour's name for a best, or the
 * reason a lap is not counted. A sector says which one before its time.
 */
export function lapGridTooltip(cell: LapGridCell, measure: LapGridMeasure): string {
  const head = `Lap ${cell.lap}`;
  const time =
    cell.ms === null
      ? 'no time'
      : `${measure === 'lap' ? '' : `${MEASURE_NAMES[measure]} `}${formatFigure(cell.ms, measure)}`;
  if (cell.reasons.length > 0) {
    const why = cell.reasons.map((reason) => LAP_GRID_EXCLUSION_NAMES[reason]).join(', ');
    return `${head} · ${time} · ${why}, not counted`;
  }
  if (cell.ms === null) return `${head} · ${time}`;
  if (cell.status === 'fastest') return `${head} · ${time} · race best`;
  if (cell.status === 'personal') return `${head} · ${time} · personal best`;
  return `${head} · ${time} · ${formatDelta(cell.deltaMs ?? 0)} to PB`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * One sentence for a row, which is what a screen reader hears instead of the colours:
 * "VER, best lap 1:32.418 on lap 41, 6 personal bests, 2 race bests". Only the cells handed in
 * are read, so the page passes the ones the clock has reached and the sentence never spoils.
 *
 * The counts follow the colours: a race best is purple and is not counted again as a personal
 * best, so the sentence says what a sighted viewer counts on the row.
 */
export function lapGridSummary(
  code: string,
  cells: readonly LapGridCell[],
  measure: LapGridMeasure,
): string {
  let best: LapGridCell | undefined;
  let personal = 0;
  let fastest = 0;
  for (const cell of cells) {
    if (cell.status === 'personal') personal++;
    if (cell.status === 'fastest') fastest++;
    const counted = cell.status === 'fastest' || cell.status === 'personal';
    if (counted && cell.ms !== null && (best?.ms == null || cell.ms < best.ms)) best = cell;
  }
  const name = MEASURE_NAMES[measure];
  if (best?.ms == null) return `${code}, no counted ${name} yet`;
  return `${code}, best ${name} ${formatFigure(best.ms, measure)} on lap ${best.lap}, ${plural(personal, 'personal best')}, ${plural(fastest, 'race best')}`;
}
