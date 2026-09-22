import type { SectorTime, TimingRow, TrackMarker } from '@/registry/boxbox/lib/types';
import type { OvertakeMode } from '@/registry/boxbox/ui/overtake-indicator';
import type { PodiumEntry, PodiumSteps } from '@/registry/boxbox/ui/podium';
import { formatGap, resultValue } from '@/registry/boxbox/ui/timing-tower';
import type { ReplayLap, ReplayLapRow, ReplayRace } from './replay-schema';

/**
 * Maps a replay race onto the shapes the registry components take. Everything here is pure:
 * the same race, lap and elapsed time always give the same rows and markers, so the page can
 * call it on every tick and the tests can call it without a clock.
 *
 * The replay dataset has no sector times and no tyre data, so both are filled with placeholders
 * and the page renders the tower with `showTyre={false}`.
 */

const UNSET_SECTORS: [SectorTime, SectorTime, SectorTime] = [
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
];

/** A neutral tyre, never shown: the replay page passes `showTyre={false}`. */
const PLACEHOLDER_TYRE = { compound: 'M', age: 0 } as const;

function sectors(): [SectorTime, SectorTime, SectorTime] {
  return [{ ...UNSET_SECTORS[0] }, { ...UNSET_SECTORS[1] }, { ...UNSET_SECTORS[2] }];
}

/** Milliseconds to seconds, keeping `null` as "no value" rather than zero. */
function toSeconds(ms: number | null): number | null {
  return ms === null ? null : ms / 1000;
}

function lapAt(race: ReplayRace, lap: number): ReplayLap | undefined {
  // The dataset is written in lap order, so the index is the fast path; `find` covers a gap.
  const indexed = race.laps[lap - 1];
  if (indexed?.lap === lap) return indexed;
  return race.laps.find((entry) => entry.lap === lap);
}

/** One timed lap of one car: it runs from `start` to `end` on the race clock. */
type DriverLap = { lap: number; start: number; end: number; row: ReplayLapRow };

/** Each car's timed laps in lap order. */
type RaceIndex = Map<string, DriverLap[]>;

/**
 * The index is derived from the race alone, so it is built once per race object and looked up
 * by identity afterwards: the hook calls into this module ten times a second.
 */
const INDEXES = new WeakMap<ReplayRace, RaceIndex>();

/**
 * A car is on lap N from its cumulative time at the end of lap N-1 until its cumulative time at
 * the end of lap N. A lap whose start is unknown — the car's cumulative time is missing, or the
 * lap does not follow the car's previous one (a gap in the source) — cannot be timed and is left
 * out, rather than placed at a guess.
 */
function indexRace(race: ReplayRace): RaceIndex {
  const cached = INDEXES.get(race);
  if (cached) return cached;

  const index: RaceIndex = new Map();
  /** The end of each car's previous lap: the lap number and the cumulative time at the line. */
  const lastLine = new Map<string, { lap: number; at: number }>();

  for (const entry of race.laps) {
    for (const row of entry.rows) {
      const previous = lastLine.get(row.driverId);
      const start = entry.lap === 1 ? 0 : previous?.lap === entry.lap - 1 ? previous.at : null;

      if (row.cumulativeMs === null) lastLine.delete(row.driverId);
      else lastLine.set(row.driverId, { lap: entry.lap, at: row.cumulativeMs });

      if (start === null || row.cumulativeMs === null || row.cumulativeMs <= start) continue;
      const laps = index.get(row.driverId) ?? [];
      laps.push({ lap: entry.lap, start, end: row.cumulativeMs, row });
      index.set(row.driverId, laps);
    }
  }
  INDEXES.set(race, index);
  return index;
}

/**
 * When a car reaches a race distance (laps completed plus a fraction), on its own clock, by the
 * same constant-speed assumption as `carLapsAt`. `null` when the car never recorded that lap.
 */
function timeAtDistance(laps: readonly DriverLap[], distance: number): number | null {
  const number = Math.floor(distance) + 1;
  const lap = laps.find((item) => item.lap === number);
  if (!lap) return null;
  return lap.start + (distance - (number - 1)) * (lap.end - lap.start);
}

/** The fastest of a car's timed laps before lap `until`, in seconds. */
function bestLapBefore(laps: readonly DriverLap[], until: number): number | null {
  let best: number | null = null;
  for (const lap of laps) {
    if (lap.lap >= until) break;
    const time = lap.row.lapTimeMs;
    if (time !== null && (best === null || time < best)) best = time;
  }
  return toSeconds(best);
}

/** A result counts as classified when it finished and carries a real position. */
function isClassifiedResult(finishStatus: string, position: number | null): boolean {
  return finishStatus === 'finished' && position !== null;
}

/**
 * The final classification. Classified cars come first by position, then everyone who did not
 * finish in the order the results carry them. Unclassified cars get a synthetic position from
 * that order, because the tower sorts on `position` and a `null` has nowhere to go.
 *
 * `lapsBehind` comes from the results, not from the per-lap estimate: the `+N Lap(s)` status is
 * the authoritative one, and the per-lap value flickers while the leader is in the pits.
 */
export function replayResultsRows(race: ReplayRace): TimingRow[] {
  const classified = race.results.filter((result) =>
    isClassifiedResult(result.finishStatus, result.position),
  );
  const unclassified = race.results.filter(
    (result) => !isClassifiedResult(result.finishStatus, result.position),
  );
  const ordered = [
    ...[...classified].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    ...unclassified,
  ];

  return ordered.map((result, index) => ({
    driverId: result.driverId,
    position: isClassifiedResult(result.finishStatus, result.position)
      ? (result.position ?? index + 1)
      : index + 1,
    gapToLeader: toSeconds(result.gapToWinnerMs),
    interval: null,
    lastLapTime: null,
    bestLapTime: null,
    sectors: sectors(),
    tyre: { ...PLACEHOLDER_TYRE },
    inPit: false,
    lapped: result.lapsBehind > 0,
    lapsBehind: result.lapsBehind,
    drs: false,
    positionChange: 0,
    points: result.points,
    finishStatus: result.finishStatus,
  }));
}

/** A race time as `H:MM:SS.mmm`. Only the winner carries one; everyone else has a gap. */
export function formatRaceTime(ms: number): string {
  const total = Math.max(0, ms);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = Math.floor(total % 1000);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * The top three of the final classification. The winner's step shows the race time, the other
 * two show what their tower row shows: a gap, or `+1 LAP` for a car a lap down.
 */
export function replayPodium(race: ReplayRace): PodiumSteps | null {
  const rows = replayResultsRows(race).filter(
    (row) => (row.finishStatus ?? 'finished') === 'finished',
  );
  const drivers = new Map(race.drivers.map((driver) => [driver.id, driver]));
  const teams = new Map(race.teams.map((team) => [team.id, team]));
  const winnerTime = race.results.find((result) => result.position === 1)?.timeMs ?? null;

  const entries: PodiumEntry[] = [];
  for (const [index, row] of rows.slice(0, 3).entries()) {
    const driver = drivers.get(row.driverId);
    const team = driver ? teams.get(driver.teamId) : undefined;
    if (!driver || !team) return null;
    const isWinner = index === 0;
    entries.push({
      driver,
      team,
      detail:
        isWinner && winnerTime !== null ? formatRaceTime(winnerTime) : resultValue(row, isWinner),
    });
  }

  const [first, second, third] = entries;
  return first && second && third ? [first, second, third] : null;
}

/** The lap a car is running at a moment of the race, and how far into it the car is. */
export type CarLap = {
  lap: number;
  row: ReplayLapRow;
  /**
   * 0 at the start of the lap, approaching 1 at the line; while `inPit`, 0 at pit entry
   * and approaching 1 at pit exit instead.
   */
  progress: number;
  /** Laps completed plus the lap fraction: the car's place along the race, for ordering cars. */
  distance: number;
  /** The car is in the pit lane right now (needs a `PitLaneShape`; otherwise the lap's flag). */
  inPit: boolean;
};

/** Where a circuit's pit lane leaves and rejoins the lap, as fractions of it. */
export type PitLaneShape = { entry: number; exit: number };

/**
 * When a lap's pit stop has the car in the lane, on the car's clock. The source gives the
 * time from entry to exit; the line sits inside the lane, at `before / span` of it, so the
 * car enters that share of the duration before it completes the lap. A stop that would start
 * before the lap does (a red flag, a stop longer than the lap) cannot be drawn: `null`.
 */
function pitWindow(lap: DriverLap, shape: PitLaneShape) {
  const duration = lap.row.inPit ? lap.row.pitDurationMs : null;
  if (duration === null || duration <= 0) return null;
  const before = 1 - shape.entry;
  const span = before + shape.exit;
  const inAt = lap.end - duration * (before / span);
  if (inAt <= lap.start) return null;
  return { inAt, outAt: inAt + duration, duration, span };
}

/**
 * Where a car is on the lap `lap` at `elapsedMs` when its pit stops are drawn: on the lane
 * between entry and exit, stretched to reach the entry from the start of an in-lap, and to
 * reach the line from the exit on an out-lap.
 */
function placeWithPit(
  laps: readonly DriverLap[],
  index: number,
  elapsedMs: number,
  shape: PitLaneShape,
): { progress: number; fraction: number; inPit: boolean } {
  const lap = laps[index]!;
  const previous = laps[index - 1];
  const stop = pitWindow(lap, shape);
  const earlier = previous && previous.lap === lap.lap - 1 ? pitWindow(previous, shape) : null;

  if (stop && elapsedMs >= stop.inAt) {
    const progress = (elapsedMs - stop.inAt) / stop.duration;
    return { progress, fraction: shape.entry + progress * stop.span, inPit: true };
  }
  if (earlier && elapsedMs < earlier.outAt && earlier.outAt < lap.end) {
    const progress = (elapsedMs - earlier.inAt) / earlier.duration;
    return { progress, fraction: shape.entry + progress * earlier.span - 1, inPit: true };
  }
  if (stop) {
    const fraction = (shape.entry * (elapsedMs - lap.start)) / (stop.inAt - lap.start);
    return { progress: fraction, fraction, inPit: false };
  }
  if (earlier && earlier.outAt < lap.end) {
    const fraction =
      shape.exit + ((1 - shape.exit) * (elapsedMs - earlier.outAt)) / (lap.end - earlier.outAt);
    return { progress: fraction, fraction, inPit: false };
  }
  // No drawable stop touches this lap. A stop that could not be drawn still flags the lap.
  const fraction = (elapsedMs - lap.start) / (lap.end - lap.start);
  return { progress: fraction, fraction, inPit: lap.row.inPit };
}

/**
 * Which lap each car is on at `elapsedMs`, measured on that car's own clock, in `race.drivers`
 * order.
 *
 * That differs from the leader's lap: a car a minute behind is still finishing lap N when the
 * leader starts lap N+1, and a lapped car is a whole lap further back. Keying every car to the
 * leader's lap is what made cars jump back to the start line at each lap boundary.
 *
 * With a `pit` shape, a lap with a timed stop puts the car in the pit lane for the stop's
 * duration around the line; without one, the lap's own pit flag stands for the whole lap.
 *
 * A car with no lap in progress — it has retired, or its lap cannot be timed — is absent.
 */
export function carLapsAt(
  race: ReplayRace,
  elapsedMs: number,
  pit?: PitLaneShape,
): Map<string, CarLap> {
  const index = indexRace(race);
  const cars = new Map<string, CarLap>();
  for (const driver of race.drivers) {
    const laps = index.get(driver.id) ?? [];
    const at = laps.findIndex((item) => elapsedMs >= item.start && elapsedMs < item.end);
    const lap = laps[at];
    if (!lap) continue;
    const placed = pit ? placeWithPit(laps, at, elapsedMs, pit) : placeOnLap(lap, elapsedMs);
    cars.set(driver.id, {
      lap: lap.lap,
      row: lap.row,
      progress: placed.progress,
      distance: lap.lap - 1 + placed.fraction,
      inPit: placed.inPit,
    });
  }
  return cars;
}

/** Constant speed around the lap; the lap's own pit flag stands for the whole lap. */
function placeOnLap(lap: DriverLap, elapsedMs: number) {
  const fraction = (elapsedMs - lap.start) / (lap.end - lap.start);
  return { progress: fraction, fraction, inPit: lap.row.inPit };
}

/** The running order at a moment: cars furthest along the race first. Stable for ties. */
function orderAt(race: ReplayRace, elapsedMs: number, pit?: PitLaneShape): [string, CarLap][] {
  return [...carLapsAt(race, elapsedMs, pit)].sort((a, b) => b[1].distance - a[1].distance);
}

/** Every drawable pit stop of the race: who, which lap, and when the car enters the lane. */
export function replayPitStops(
  race: ReplayRace,
  pit: PitLaneShape,
): { driverId: string; lap: number; atMs: number }[] {
  const stops: { driverId: string; lap: number; atMs: number }[] = [];
  for (const [driverId, laps] of indexRace(race)) {
    for (const lap of laps) {
      const window = pitWindow(lap, pit);
      if (window) stops.push({ driverId, lap: lap.lap, atMs: window.inAt });
    }
  }
  return stops.sort((a, b) => a.atMs - b.atMs);
}

/** Overtake aid threshold, the same one the dataset applies at the line. */
const OVERTAKE_WITHIN_MS = 1000;

export type LiveRowsOptions = {
  /**
   * The moment gaps and intervals are measured at; defaults to `elapsedMs`. A timing screen
   * refreshes its numbers less often than it reorders, so the page passes a rounded-down clock.
   */
  gapAtMs?: number;
  /** The moment the position change is measured against; without it every row reads unchanged. */
  referenceMs?: number;
  /** The circuit's pit lane, so `IN PIT` covers the stop itself rather than the whole lap. */
  pit?: PitLaneShape;
};

/**
 * The tower rows at a moment of the race, between the laps the dataset records.
 *
 * Order is by race distance, so an overtake shows when the interpolated cars cross, not when the
 * leader next completes a lap. The gap is how long ago the leader passed the point the car is at
 * now, on the leader's own lap times; the interval is the same against the car ahead. Measured
 * that way the gap grows with the distance behind, so it never disagrees with the order, and at
 * the line it equals the gap the dataset records. Both are interpolations, and the page says so.
 *
 * Cars out of the race stay listed after the running cars, the most recent retirement first,
 * carrying their finish status so the tower reads them as `OUT`.
 */
export function replayLiveRows(
  race: ReplayRace,
  elapsedMs: number,
  { gapAtMs = elapsedMs, referenceMs, pit }: LiveRowsOptions = {},
): TimingRow[] {
  const index = indexRace(race);
  const order = orderAt(race, elapsedMs, pit);
  const measured = gapAtMs === elapsedMs ? new Map(order) : carLapsAt(race, gapAtMs, pit);
  const reference =
    referenceMs === undefined
      ? null
      : new Map(orderAt(race, referenceMs, pit).map(([id], i) => [id, i + 1]));

  /** How long ago `aheadId` passed the point `car` is at, in ms; `null` when it cannot be timed. */
  const timeBehind = (car: CarLap | undefined, aheadId: string | undefined): number | null => {
    const laps = aheadId === undefined ? undefined : index.get(aheadId);
    const passed = car && laps ? timeAtDistance(laps, car.distance) : null;
    return passed === null ? null : gapAtMs - passed;
  };

  const leaderId = order[0]?.[0];
  // On the grid nobody has a gap yet; a column of +0.000 would read as a timing screen glitch.
  const started = (order[0]?.[1].distance ?? 0) > 0;
  const rows: TimingRow[] = order.map(([driverId, car], i) => {
    const position = i + 1;
    const laps = index.get(driverId) ?? [];
    const leader = order[0]?.[1];
    const lapsBehind = leader ? Math.floor(leader.distance - car.distance) : 0;
    const gapToLeader = !started
      ? null
      : i === 0
        ? 0
        : timeBehind(measured.get(driverId), leaderId);
    const interval =
      !started || i === 0 ? null : timeBehind(measured.get(driverId), order[i - 1]?.[0]);
    const lastLap = laps.find((item) => item.lap === car.lap - 1);

    return {
      driverId,
      position,
      gapToLeader: gapToLeader === null ? null : gapToLeader / 1000,
      interval: interval === null ? null : interval / 1000,
      lastLapTime: toSeconds(lastLap?.row.lapTimeMs ?? null),
      bestLapTime: bestLapBefore(laps, car.lap),
      sectors: sectors(),
      tyre: { ...PLACEHOLDER_TYRE },
      inPit: car.inPit,
      lapped: lapsBehind > 0,
      lapsBehind,
      // No aid on the opening lap, as the rules have it; interpolation there would fake it anyway.
      drs:
        interval !== null &&
        interval < OVERTAKE_WITHIN_MS &&
        !car.inPit &&
        position > 1 &&
        car.lap > 1,
      positionChange: reference === null ? 0 : (reference.get(driverId) ?? position) - position,
    };
  });

  const running = new Set(order.map(([id]) => id));
  const out = race.results
    .filter((result) => !running.has(result.driverId) && result.finishStatus !== 'finished')
    .map((result) => ({ result, leftAt: index.get(result.driverId)?.at(-1)?.end ?? -1 }))
    .filter((item) => item.leftAt <= elapsedMs)
    .sort((a, b) => b.leftAt - a.leftAt);

  for (const { result } of out) {
    rows.push({
      driverId: result.driverId,
      position: rows.length + 1,
      gapToLeader: null,
      interval: null,
      lastLapTime: null,
      bestLapTime: bestLapBefore(index.get(result.driverId) ?? [], Number.POSITIVE_INFINITY),
      sectors: sectors(),
      tyre: { ...PLACEHOLDER_TYRE },
      inPit: false,
      lapped: false,
      lapsBehind: 0,
      drs: false,
      positionChange: 0,
      finishStatus: result.finishStatus,
    });
  }
  return rows;
}

/**
 * Where each car sits on the track at `elapsedMs`, as progress from 0 to 1 around its own lap.
 *
 * The replay carries one time per lap, so a car is assumed to circulate at a constant speed. It
 * is an interpolation, not telemetry, and the page says so. The car furthest along the race is
 * emphasised as the leader. Markers keep the order of `race.drivers`, so the Track Map sees a
 * stable list and animates each car rather than re-keying the set.
 */
export function replayProgress(
  race: ReplayRace,
  elapsedMs: number,
  pit?: PitLaneShape,
): TrackMarker[] {
  const cars = carLapsAt(race, elapsedMs, pit);
  const teams = new Map(race.teams.map((team) => [team.id, team]));

  let leader: { id: string; distance: number } | null = null;
  for (const [id, car] of cars) {
    if (leader === null || car.distance > leader.distance) leader = { id, distance: car.distance };
  }

  const markers: TrackMarker[] = [];
  for (const driver of race.drivers) {
    const car = cars.get(driver.id);
    if (!car) continue;
    markers.push({
      id: driver.id,
      progress: car.progress,
      color: teams.get(driver.teamId)?.color ?? 'currentColor',
      code: driver.code,
      emphasis: driver.id === leader?.id,
      inPit: car.inPit,
    });
  }
  return markers;
}

/**
 * Which overtake aid the season had. DRS ran until the end of 2025; the 2026 regulations
 * replaced it with the manual override, so the indicator reads `OVERTAKE` from 2026 on.
 */
export function overtakeModeFor(season: number): OvertakeMode {
  return season >= 2026 ? 'overtake' : 'drs';
}

/**
 * The leader's race time at the end of `lap`, which is the replay clock's lap boundary.
 * Lap 0 is the start. A lap with no usable leader time falls back to the last one that had
 * it, so the boundaries never move backwards.
 */
export function leaderCumulative(race: ReplayRace, lap: number): number {
  if (lap <= 0) return 0;
  for (let candidate = Math.min(lap, race.laps.length); candidate >= 1; candidate--) {
    const leader = lapAt(race, candidate)?.rows.find((row) => row.position === 1);
    if (leader?.cumulativeMs != null) return leader.cumulativeMs;
  }
  return 0;
}

/** Formats a gap in seconds the way the tower does; re-exported so the page has one source. */
export { formatGap };
