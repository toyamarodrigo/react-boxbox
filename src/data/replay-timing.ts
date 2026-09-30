import type {
  SectorStatus,
  SectorTime,
  TimingRow,
  TrackMarker,
  TrackSector,
  TrackStatus,
} from '@/registry/boxbox/lib/types';
import type { OvertakeMode } from '@/registry/boxbox/ui/overtake-indicator';
import type { PodiumEntry, PodiumSteps } from '@/registry/boxbox/ui/podium';
import { formatGap, resultValue } from '@/registry/boxbox/ui/timing-tower';
import type {
  ReplayLap,
  ReplayLapRow,
  ReplayRace,
  ReplayRaceControl,
  ReplayStint,
} from './replay-schema';

/**
 * Maps a replay race onto the shapes the registry components take. Everything here is pure:
 * the same race, lap and elapsed time always give the same rows and markers, so the page can
 * call it on every tick and the tests can call it without a clock.
 *
 * The tower rows carry placeholder sectors and tyres: the page renders it with
 * `showTyre={false}`, and the real sector times are read through `sectorStatusesAt` for the one
 * car the viewer follows rather than for every row.
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
 * Every row carries its positions gained against the grid.
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

  return ordered.map((result, index) => {
    const row: TimingRow = {
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
    };
    return { ...row, ...positionsGained(race, row) };
  });
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

/** A pit stop the timeline can draw and describe. */
export type ReplayPitStop = {
  driverId: string;
  /** The driver's three-letter code, for the mark's label; falls back to the id. */
  code: string;
  lap: number;
  /** Which stop of the driver's race this is, when the dataset counts them. */
  stop: number | null;
  /** When the car enters the lane, on the race clock. */
  atMs: number;
  /** Time spent in the lane. */
  durationMs: number;
};

/** Every drawable pit stop of the race: who, which lap, and when the car enters the lane. */
export function replayPitStops(race: ReplayRace, pit: PitLaneShape): ReplayPitStop[] {
  const codes = new Map(race.drivers.map((driver) => [driver.id, driver.code]));
  const stops: ReplayPitStop[] = [];
  for (const [driverId, laps] of indexRace(race)) {
    for (const lap of laps) {
      const window = pitWindow(lap, pit);
      if (window) {
        stops.push({
          driverId,
          code: codes.get(driverId) ?? driverId,
          lap: lap.lap,
          stop: lap.row.pitStop,
          atMs: window.inAt,
          durationMs: window.duration,
        });
      }
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
 * Positions gained: the car's grid slot minus its position, positive for a gain, ready to spread
 * into a tower row.
 *
 * A pit-lane start is reported as grid 0, which is not a slot on the grid: it counts as the last
 * one, a slot per starter, and is marked `pitLaneStart`. Empty when the source never carried a
 * grid slot, and for a car out of the race.
 */
export function positionsGained(
  race: ReplayRace,
  row: Pick<TimingRow, 'driverId' | 'position' | 'finishStatus'>,
): Pick<TimingRow, 'positionsGained' | 'pitLaneStart'> {
  if ((row.finishStatus ?? 'finished') !== 'finished') return {};
  const grid = race.results.find((result) => result.driverId === row.driverId)?.grid ?? null;
  if (grid === null) return {};
  if (grid > 0) return { positionsGained: grid - row.position };
  const starters = race.results.filter((result) => result.finishStatus !== 'dns').length;
  return { positionsGained: starters - row.position, pitLaneStart: true };
}

/**
 * The set of tyres a car is on at a lap: the stint whose lap range covers it. `undefined` when
 * no stint does, which is a car with no stint data or a lap past the one it retired on.
 */
export function stintAt(
  stints: readonly ReplayStint[] | undefined,
  lap: number,
): ReplayStint | undefined {
  return stints?.find((stint) => lap >= stint.fromLap && lap <= stint.toLap);
}

/**
 * Emphasises one car and no other, so the followed driver is the car the map picks out rather
 * than whoever is furthest along. An unknown id leaves every marker unemphasised.
 */
export function emphasiseMarker(markers: readonly TrackMarker[], id: string): TrackMarker[] {
  return markers.map((marker) => ({ ...marker, emphasis: marker.id === id }));
}

/**
 * The driver a code in the URL names. A code is what a viewer reads off the tower, so it is what
 * addresses the followed driver; an unknown one resolves to nobody and is ignored.
 */
export function followedDriverId(race: ReplayRace, code: string | undefined): string | undefined {
  if (code === undefined) return undefined;
  const wanted = code.toUpperCase();
  return race.drivers.find((driver) => driver.code.toUpperCase() === wanted)?.id;
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

/**
 * How many laps the leader has completed at `elapsedMs`. That is the lap the gap chart may draw
 * up to: gaps are measured at the line, and a lap nobody has finished has none.
 */
export function leaderLapsCompleted(race: ReplayRace, elapsedMs: number): number {
  let completed = 0;
  for (let lap = 1; lap <= race.laps.length; lap++) {
    if (leaderCumulative(race, lap) > elapsedMs) break;
    completed = lap;
  }
  return completed;
}

/**
 * Every car's gap to the leader in seconds at the end of each lap, by driver id: index `i` is the
 * gap after lap `i + 1`.
 *
 * `null` is a lap the car has no comparable time for — it was out, or the source never timed it —
 * and the chart breaks the line there rather than joining across it. A lapped car keeps the gap
 * the dataset gives it, which includes the lap it is down; that is what puts it off the bottom of
 * the chart, which is where it belongs.
 */
export function replayGaps(race: ReplayRace): Map<string, (number | null)[]> {
  const laps = race.laps.length;
  const gaps = new Map<string, (number | null)[]>(
    race.drivers.map((driver) => [driver.id, Array.from({ length: laps }, () => null)]),
  );
  for (const [index, lap] of race.laps.entries()) {
    for (const row of lap.rows) {
      const own = gaps.get(row.driverId);
      if (own === undefined || row.gapToLeaderMs === null) continue;
      own[index] = row.gapToLeaderMs / 1000;
    }
  }
  return gaps;
}

/** Formats a gap in seconds the way the tower does; re-exported so the page has one source. */
export { formatGap };

/* ---------------------------------------------------------------------------------------------
 * Sector times and speed trap
 *
 * Both come from OpenF1 as one figure per car per lap, so the page has to place them on the race
 * clock itself. A sector is complete once the car has run it, which is the lap's start plus the
 * sectors before it; a speed-trap reading is released at the line, because the source never says
 * where on the lap the trap sits and the line is the first moment the reading cannot spoil.
 *
 * Nothing is ever read from a lap the clock has not reached, and the same rule governs the bests:
 * `fastest` is the best of the race among everything completed at or before the moment asked
 * about, `personal` the same for one car. That keeps the replay honest under seeking.
 * ------------------------------------------------------------------------------------------- */

/** The best sector time per sector so far, in milliseconds; `null` where nobody has one yet. */
type BestSectors = [number | null, number | null, number | null];

/** One sector completion. `ms` is the sector time; `at` is when the car finished the sector. */
type SectorEvent = { at: number; driverId: string; sector: number; ms: number };

/** Completions in race-clock order, with the running best after each one. */
type SectorRuns = { ats: number[]; best: BestSectors[] };

type TimingIndex = {
  race: SectorRuns;
  cars: Map<string, SectorRuns>;
  /** Per car, per lap: the sector times and when each sector is complete. */
  laps: Map<string, Map<number, { sectorMs: ReplayLapRow['sectorMs']; ends: (number | null)[] }>>;
  /** Completed lap totals in race-clock order, with the running best after each. */
  lapRuns: { ats: number[]; best: number[] };
  carLapRuns: Map<string, { ats: number[]; best: number[] }>;
  speedAts: number[];
  /** The best of the race after each reading, in the same order as `speedAts`. */
  speedBest: { driverId: string; speedKph: number }[];
  carSpeeds: Map<string, { ats: number[]; kph: number[] }>;
};

/**
 * When each sector of a lap is complete, on the race clock. A sector whose own time is missing
 * has no moment of its own, and a sector after a missing one cannot be placed inside the lap, so
 * it is held back to the line: later than the truth, never earlier, so it can never spoil.
 */
function sectorEnds(lap: DriverLap): (number | null)[] {
  let running = lap.start;
  let placed = true;
  return lap.row.sectorMs.map((ms) => {
    if (ms === null) {
      placed = false;
      return null;
    }
    if (!placed) return lap.end;
    running += ms;
    // The two sources disagree by a few milliseconds, so a sum may overshoot the car's own line.
    return Math.min(running, lap.end);
  });
}

function sectorRuns(events: readonly SectorEvent[]): SectorRuns {
  const ats: number[] = [];
  const best: BestSectors[] = [];
  const current: (number | null)[] = [null, null, null];
  for (const event of events) {
    const held = current[event.sector];
    if (held == null || event.ms < held) current[event.sector] = event.ms;
    ats.push(event.at);
    best.push([current[0] ?? null, current[1] ?? null, current[2] ?? null]);
  }
  return { ats, best };
}

/** A lap's time from its sectors, or null unless the source timed all three of them. */
function lapTotal(sectorMs: ReplayLapRow['sectorMs']): number | null {
  return sectorMs.reduce<number | null>(
    (sum, ms) => (sum === null || ms === null ? null : sum + ms),
    0,
  );
}

/** The best completed lap at a moment, in milliseconds; null before anyone has finished one. */
function bestLapAt(
  runs: { ats: number[]; best: number[] } | undefined,
  elapsedMs: number,
): number | null {
  if (runs === undefined) return null;
  const count = countAtOrBefore(runs.ats, elapsedMs);
  return count === 0 ? null : (runs.best[count - 1] ?? null);
}

/** The same running-best walk as `sectorRuns`, over whole laps rather than sectors. */
function lapRuns(entries: readonly { at: number; ms: number }[]): {
  ats: number[];
  best: number[];
} {
  const ats: number[] = [];
  const best: number[] = [];
  let running = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    if (entry.ms < running) running = entry.ms;
    ats.push(entry.at);
    best.push(running);
  }
  return { ats, best };
}

/** Built once per race object, like `indexRace`: the page asks for these ten times a second. */
const TIMING_INDEXES = new WeakMap<ReplayRace, TimingIndex>();

function indexTiming(race: ReplayRace): TimingIndex {
  const cached = TIMING_INDEXES.get(race);
  if (cached) return cached;

  const events: SectorEvent[] = [];
  const byCar = new Map<string, SectorEvent[]>();
  const speeds: { at: number; driverId: string; speedKph: number }[] = [];
  const carSpeeds = new Map<string, { ats: number[]; kph: number[] }>();
  const laps: TimingIndex['laps'] = new Map();
  /** A lap only has a total once all three of its sectors are timed. */
  const lapTotals: { at: number; driverId: string; ms: number }[] = [];

  for (const [driverId, driverLaps] of indexRace(race)) {
    const own: SectorEvent[] = [];
    const ownSpeeds = { ats: [] as number[], kph: [] as number[] };
    const byLap = new Map<
      number,
      { sectorMs: ReplayLapRow['sectorMs']; ends: (number | null)[] }
    >();

    for (const lap of driverLaps) {
      const ends = sectorEnds(lap);
      byLap.set(lap.lap, { sectorMs: lap.row.sectorMs, ends });
      for (const [sector, ms] of lap.row.sectorMs.entries()) {
        const at = ends[sector];
        if (ms === null || at == null) continue;
        own.push({ at, driverId, sector, ms });
      }
      const total = lapTotal(lap.row.sectorMs);
      if (total !== null) lapTotals.push({ at: lap.end, driverId, ms: total });
      if (lap.row.speedTrapKph !== null) {
        ownSpeeds.ats.push(lap.end);
        ownSpeeds.kph.push(lap.row.speedTrapKph);
        speeds.push({ at: lap.end, driverId, speedKph: lap.row.speedTrapKph });
      }
    }

    own.sort((a, b) => a.at - b.at);
    events.push(...own);
    byCar.set(driverId, own);
    carSpeeds.set(driverId, ownSpeeds);
    laps.set(driverId, byLap);
  }

  events.sort((a, b) => a.at - b.at);
  speeds.sort((a, b) => a.at - b.at);
  lapTotals.sort((a, b) => a.at - b.at);

  const speedAts: number[] = [];
  const speedBest: { driverId: string; speedKph: number }[] = [];
  let leading: { driverId: string; speedKph: number } | null = null;
  for (const reading of speeds) {
    if (leading === null || reading.speedKph > leading.speedKph) {
      leading = { driverId: reading.driverId, speedKph: reading.speedKph };
    }
    speedAts.push(reading.at);
    speedBest.push(leading);
  }

  const index: TimingIndex = {
    race: sectorRuns(events),
    lapRuns: lapRuns(lapTotals),
    carLapRuns: new Map(
      [...new Set(lapTotals.map((entry) => entry.driverId))].map((id) => [
        id,
        lapRuns(lapTotals.filter((entry) => entry.driverId === id)),
      ]),
    ),
    cars: new Map([...byCar].map(([id, own]) => [id, sectorRuns(own)])),
    laps,
    speedAts,
    speedBest,
    carSpeeds,
  };
  TIMING_INDEXES.set(race, index);
  return index;
}

/** How many entries of a list sorted ascending sit at or before `at`. */
function countAtOrBefore(ats: readonly number[], at: number): number {
  let low = 0;
  let high = ats.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((ats[mid] ?? 0) <= at) low = mid + 1;
    else high = mid;
  }
  return low;
}

const NO_BESTS: BestSectors = [null, null, null];

function bestsAt(runs: SectorRuns | undefined, elapsedMs: number): BestSectors {
  if (runs === undefined) return NO_BESTS;
  const count = countAtOrBefore(runs.ats, elapsedMs);
  return count === 0 ? NO_BESTS : (runs.best[count - 1] ?? NO_BESTS);
}

/**
 * The bests count the sector being judged, so the comparison is `<=`: a sector that *is* the best
 * reads as the best. Two cars on the same time are both shown as the fastest, which is what a
 * timing screen does with a tie.
 */
function sectorStatus(ms: number, raceBest: number | null, carBest: number | null): SectorStatus {
  if (raceBest !== null && ms <= raceBest) return 'fastest';
  if (carBest !== null && ms <= carBest) return 'personal';
  return 'slower';
}

/**
 * One car's three sector times on a lap, as the Sector Times component takes them, at a moment of
 * the race. Seconds, like every other time the components read.
 *
 * A sector the car has not finished yet at `elapsedMs` is `unset`, so the panel fills in as the
 * lap runs rather than showing the lap before the clock reaches it. A sector that is complete is
 * `fastest` when it is the best of the race so far, `personal` when it is only the car's own
 * best, else `slower` — each measured against everything completed at or before `elapsedMs`,
 * this sector included.
 */
export function sectorStatusesAt(
  race: ReplayRace,
  driverId: string,
  lap: number,
  elapsedMs: number,
): [SectorTime, SectorTime, SectorTime] {
  const index = indexTiming(race);
  const found = index.laps.get(driverId)?.get(lap);
  if (found === undefined) return sectors();

  const raceBest = bestsAt(index.race, elapsedMs);
  const carBest = bestsAt(index.cars.get(driverId), elapsedMs);

  const times = found.sectorMs.map((ms, sector): SectorTime => {
    const at = found.ends[sector];
    if (ms === null || at == null || at > elapsedMs) return { time: null, status: 'unset' };
    return {
      time: ms / 1000,
      status: sectorStatus(ms, raceBest[sector] ?? null, carBest[sector] ?? null),
    };
  });
  return [times[0] ?? UNSET_SECTORS[0], times[1] ?? UNSET_SECTORS[1], times[2] ?? UNSET_SECTORS[2]];
}

/**
 * The lap a sector card should be showing, and that lap's own time once it is over.
 *
 * A card cannot mix laps: three sectors of the lap in progress beside the *previous* lap's time
 * reads as one lap that somehow has no sectors. So the card holds the last lap the car finished —
 * all three sectors and the time they add up to — until the car completes the first sector of the
 * new one, and only then follows it round. That is how a broadcast does it, and it means the
 * figures on the card always belong together.
 *
 * `lapTime` is in seconds, and is null exactly while the shown lap is still being run.
 */
export function sectorCardAt(
  race: ReplayRace,
  driverId: string,
  lap: number,
  elapsedMs: number,
): {
  lap: number;
  sectors: [SectorTime, SectorTime, SectorTime];
  lapTime: number | null;
  lapStatus: SectorStatus;
} {
  const running = sectorStatusesAt(race, driverId, lap, elapsedMs);
  // The lap in progress owns the card from its first sector on.
  if (running.some((sector) => sector.time !== null)) {
    return { lap, sectors: running, lapTime: null, lapStatus: 'unset' };
  }

  const previous = lap - 1;
  const finished = previous < 1 ? undefined : indexTiming(race).laps.get(driverId)?.get(previous);
  if (finished === undefined) return { lap, sectors: running, lapTime: null, lapStatus: 'unset' };

  const sectors = sectorStatusesAt(race, driverId, previous, elapsedMs);
  const total = lapTotal(finished.sectorMs);
  if (total === null) {
    return { lap: previous, sectors, lapTime: null, lapStatus: 'unset' };
  }

  // The lap is judged the way its sectors are: against every lap completed at or before now, this
  // one included, so a lap that *is* the best of the race reads as the best.
  const index = indexTiming(race);
  return {
    lap: previous,
    sectors,
    lapTime: total / 1000,
    lapStatus: sectorStatus(
      total,
      bestLapAt(index.lapRuns, elapsedMs),
      bestLapAt(index.carLapRuns.get(driverId), elapsedMs),
    ),
  };
}

/**
 * Whether the race carries any OpenF1 timing at all — one sector or one trap reading is enough.
 *
 * Asked of the laps rather than of `source.timing` or of the race id: a race built before the
 * timing block existed has no source entry and may still have figures, and a season OpenF1 does
 * not cover has the entry but every figure null. A page uses this to decide between a panel that
 * will fill in as the race runs and one that would show em dashes for two hours.
 */
export function hasTimingData(race: ReplayRace): boolean {
  const index = indexTiming(race);
  return index.race.ats.length > 0 || index.speedAts.length > 0;
}

/**
 * A car's most recent speed-trap reading at `elapsedMs`, in km/h. `null` until it has one: an
 * older season OpenF1 does not cover never gets one at all.
 */
export function speedTrapAt(race: ReplayRace, driverId: string, elapsedMs: number): number | null {
  const own = indexTiming(race).carSpeeds.get(driverId);
  if (own === undefined) return null;
  const count = countAtOrBefore(own.ats, elapsedMs);
  return count === 0 ? null : (own.kph[count - 1] ?? null);
}

/* ---------------------------------------------------------------------------------------------
 * Race control
 *
 * The dataset keeps race control's messages as the source wrote them, so reading them is this
 * module's job. Two questions are asked of them ten times a second — which flag is flying, and
 * which parts of the lap are under a local flag — and both are answered by walking the messages
 * once per race and remembering the state after each one; a lookup is then a binary search.
 * ------------------------------------------------------------------------------------------- */

/**
 * The safety-car wordings, longest first, because `VIRTUAL SAFETY CAR DEPLOYED` contains
 * `SAFETY CAR DEPLOYED`. The car state outranks whatever flag is out while it is deployed and is
 * cleared by its own ending message, which is how the boards work: the flags stay yellow through
 * the restart lap and only the green puts them out.
 *
 * Every other wording — `SAFETY CAR WILL USE...`, a warning of one to come — is deliberately not
 * matched: an unrecognised message leaves the state exactly as it was, which is a great deal
 * safer than guessing that a sentence with "safety car" in it deploys one.
 */
const SAFETY_CAR_RULES: readonly { match: string; state: 'sc' | 'vsc' | null }[] = [
  { match: 'VIRTUAL SAFETY CAR DEPLOYED', state: 'vsc' },
  { match: 'VIRTUAL SAFETY CAR ENDING', state: null },
  { match: 'VSC DEPLOYED', state: 'vsc' },
  { match: 'VSC ENDING', state: null },
  { match: 'SAFETY CAR DEPLOYED', state: 'sc' },
  { match: 'SAFETY CAR IN THIS LAP', state: null },
];

/** The state after one message: the flag over the track, and the sectors under a local flag. */
type RaceControlIndex = {
  ats: number[];
  status: TrackStatus[];
  sectors: TrackSector[][];
  /** The same messages, newest first, so the feed is a slice rather than a copy and a reverse. */
  newestFirst: ReplayRaceControl[];
};

const RACE_CONTROL_INDEXES = new WeakMap<ReplayRace, RaceControlIndex>();

/** Nothing flagged: one shared array, so a memoised consumer sees the same value every tick. */
const NO_SECTORS: TrackSector[] = [];
const NO_MESSAGES: ReplayRaceControl[] = [];

/**
 * The open zones as slices of the lap.
 *
 * A marshalling sector `k` of `n` is painted from `(k−1)/n` to `k/n`. That is an assumption, and
 * the map's caption says so: the numbering is not guaranteed to start at the line or to run with
 * the direction of travel. Neighbouring zones of the same status are merged into one arc, the
 * last and first among them too, because a zone that straddles the line is still one zone and
 * three touching arcs draw seams the real board does not have.
 */
function zonesAsSectors(zones: ReadonlyMap<number, TrackStatus>, count: number): TrackSector[] {
  if (zones.size === 0 || count < 1) return NO_SECTORS;

  const numbers = [...zones.keys()].sort((a, b) => a - b);
  const runs: { from: number; to: number; status: TrackStatus }[] = [];
  for (const number of numbers) {
    const status = zones.get(number);
    if (status === undefined || number > count) continue;
    const last = runs.at(-1);
    if (last && last.to === number - 1 && last.status === status) last.to = number;
    else runs.push({ from: number, to: number, status });
  }

  const sectors: TrackSector[] = runs.map((run) => ({
    start: (run.from - 1) / count,
    end: run.to / count,
    status: run.status,
  }));

  const first = sectors[0];
  const last = sectors.at(-1);
  if (
    sectors.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    first.start === 0 &&
    last.end === 1 &&
    first.status === last.status
  ) {
    // One zone straddling the line rather than two arcs meeting at it. `start` then sits after
    // `end`, which is how the Track Map spells a sector that wraps.
    sectors.pop();
    first.start = last.start;
  }

  return sectors;
}

/**
 * Walks the messages once and records the state after each.
 *
 * The state machine, in the order it is applied to a message:
 *
 * - a safety-car wording above sets or clears the car state, and nothing else;
 * - a driver-scoped message never touches the track: `BLUE` and `BLACK AND WHITE` are addressed to
 *   one car, and a green flag for the field is not among them;
 * - `RED` is red and puts every local flag out, and it ends the car state with them: the race is
 *   stopped, and a safety car deployed into a stoppage never gets an ending message of its own
 *   (São Paulo 2024). Without this the car would outrank the red for the rest of the race;
 * - `CHEQUERED` is chequered, and ends the car state for the same reason: the race is over;
 * - a message naming a sector opens a zone for `YELLOW` / `DOUBLE YELLOW` and closes it for
 *   `CLEAR` / `GREEN`, without touching the flag over the track;
 * - track-wide `YELLOW` / `DOUBLE YELLOW` is the flag over the track;
 * - `GREEN`, and any message reading `TRACK CLEAR`, is green and puts every local flag out;
 * - anything else — `BLACK`, `BLACK AND ORANGE`, a `SessionStatus` note, a wording nobody here has
 *   seen — leaves the state alone. An unknown message is never a guess.
 *
 * The track is green until the first message says otherwise.
 */
function indexRaceControl(race: ReplayRace): RaceControlIndex {
  const cached = RACE_CONTROL_INDEXES.get(race);
  if (cached) return cached;

  const messages = [...race.raceControl].sort((a, b) => a.atMs - b.atMs);
  // The count of marshalling sectors is whatever this race's own messages mention: the source
  // publishes no total, and a circuit with 23 posts is as normal as one with 12.
  const count = messages.reduce((most, message) => Math.max(most, message.sector ?? 0), 0);

  const index: RaceControlIndex = {
    ats: [],
    status: [],
    sectors: [],
    newestFirst: [...messages].reverse(),
  };

  let safety: TrackStatus | null = null;
  let flag: TrackStatus = 'green';
  const zones = new Map<number, TrackStatus>();

  for (const message of messages) {
    const text = message.message.toUpperCase();
    const rule = SAFETY_CAR_RULES.find((entry) => text.includes(entry.match));
    const value = message.flag?.trim().toUpperCase() ?? null;
    const scope = message.scope?.trim().toUpperCase() ?? null;

    if (rule !== undefined) {
      safety = rule.state;
    } else if (scope !== 'DRIVER') {
      if (value === 'RED') {
        flag = 'red';
        safety = null;
        zones.clear();
      } else if (value === 'CHEQUERED') {
        flag = 'chequered';
        safety = null;
      } else if (message.sector !== null && scope !== 'TRACK') {
        if (value === 'YELLOW') zones.set(message.sector, 'yellow');
        else if (value === 'DOUBLE YELLOW') zones.set(message.sector, 'double-yellow');
        else if (value === 'CLEAR' || value === 'GREEN') zones.delete(message.sector);
      } else if (value === 'YELLOW') {
        flag = 'yellow';
      } else if (value === 'DOUBLE YELLOW') {
        flag = 'double-yellow';
      } else if (value === 'GREEN' || text.includes('TRACK CLEAR')) {
        flag = 'green';
        zones.clear();
      }
    }

    index.ats.push(message.atMs);
    index.status.push(safety ?? flag);
    index.sectors.push(zonesAsSectors(zones, count));
  }

  RACE_CONTROL_INDEXES.set(race, index);
  return index;
}

/**
 * The flag flying over the track at a moment of the race. Green before the first message, and
 * green for the whole of a race the source has no messages for.
 *
 * A safety car or a virtual safety car outranks the flag underneath it, because that is what the
 * viewer needs to read first and what the banner exists to say.
 */
export function trackStatusAt(race: ReplayRace, elapsedMs: number): TrackStatus {
  const index = indexRaceControl(race);
  const count = countAtOrBefore(index.ats, elapsedMs);
  return count === 0 ? 'green' : (index.status[count - 1] ?? 'green');
}

/**
 * The marshalling sectors under a local flag at a moment of the race, as slices of the lap ready
 * for the Track Map's `sectors` prop. Empty whenever nothing is flagged, and always the same empty
 * array, so a consumer that compares by identity is not woken ten times a second for nothing.
 */
export function flaggedSectorsAt(race: ReplayRace, elapsedMs: number): TrackSector[] {
  const index = indexRaceControl(race);
  const count = countAtOrBefore(index.ats, elapsedMs);
  return count === 0 ? NO_SECTORS : (index.sectors[count - 1] ?? NO_SECTORS);
}

/**
 * Race control's messages up to a moment, newest first: the feed's own order, where the latest
 * word is the one at the top. Nothing from later in the race is ever included, so seeking back
 * takes the feed back with it.
 */
export function raceControlUpTo(race: ReplayRace, elapsedMs: number): ReplayRaceControl[] {
  const index = indexRaceControl(race);
  const count = countAtOrBefore(index.ats, elapsedMs);
  if (count === 0) return NO_MESSAGES;
  return index.newestFirst.slice(index.newestFirst.length - count);
}

/* ---------------------------------------------------------------------------------------------
 * Neutralisation
 *
 * The stretches of the race run under a safety car, a virtual safety car or a red flag, read off
 * the same state machine that paints the map, so the timeline's bands and the banner over the map
 * can never disagree about what was flying.
 * ------------------------------------------------------------------------------------------- */

/** The statuses that neutralise the race. A local flag is not one: the race runs on under it. */
export type NeutralisationStatus = Extract<TrackStatus, 'sc' | 'vsc' | 'red'>;

/** A stretch of the race under one of those statuses, on the race clock and in laps. */
export type NeutralisationPeriod = {
  status: NeutralisationStatus;
  fromMs: number;
  toMs: number;
  /** The lap in progress when it began and when it ended; `null` for a race with no laps. */
  fromLap: number | null;
  toLap: number | null;
};

function isNeutralisation(status: TrackStatus | undefined): status is NeutralisationStatus {
  return status === 'sc' || status === 'vsc' || status === 'red';
}

/** Nothing neutralised: one shared array, so a memoised consumer sees the same value every tick. */
const NO_PERIODS: NeutralisationPeriod[] = [];

const NEUTRALISATIONS = new WeakMap<ReplayRace, NeutralisationPeriod[]>();

/** The lap in progress at a moment, which is what a lap board shows; `null` for a race of none. */
function lapInProgressAt(race: ReplayRace, elapsedMs: number): number | null {
  if (race.totalLaps < 1) return null;
  return Math.min(leaderLapsCompleted(race, elapsedMs) + 1, race.totalLaps);
}

/**
 * Every stretch of the race the timeline draws as a band, in race-clock order.
 *
 * A period runs from the moment the track status becomes one of the three until the moment it
 * becomes anything else — its own ending message, a red flag, or the chequered flag. A period
 * still open when the messages run out ends with the race, so a safety car whose ending message
 * never arrives still has a length.
 *
 * Built once per race object, like the indexes it reads, and always the same empty array when
 * there is nothing: the page asks for these ten times a second.
 */
export function neutralisationPeriods(race: ReplayRace): readonly NeutralisationPeriod[] {
  const cached = NEUTRALISATIONS.get(race);
  if (cached) return cached;

  const index = indexRaceControl(race);
  const endMs = leaderCumulative(race, race.totalLaps);
  const periods: NeutralisationPeriod[] = [];
  let open: { status: NeutralisationStatus; fromMs: number } | null = null;

  const close = (toMs: number) => {
    if (open === null) return;
    const fromMs = Math.min(open.fromMs, endMs);
    const to = Math.min(Math.max(toMs, fromMs), endMs);
    if (fromMs < endMs) {
      periods.push({
        status: open.status,
        fromMs,
        toMs: to,
        fromLap: lapInProgressAt(race, fromMs),
        toLap: lapInProgressAt(race, to),
      });
    }
    open = null;
  };

  for (const [position, at] of index.ats.entries()) {
    const status = index.status[position];
    if (open !== null && status !== open.status) close(at);
    if (open === null && isNeutralisation(status)) open = { status, fromMs: at };
  }
  close(endMs);

  const built = periods.length === 0 ? NO_PERIODS : periods;
  NEUTRALISATIONS.set(race, built);
  return built;
}

const NEUTRALISATION_NAMES: Record<NeutralisationStatus, string> = {
  sc: 'safety car',
  vsc: 'virtual safety car',
  red: 'red flag',
};

/** Small counts read as words, the way a sentence reads them; anything larger stays a figure. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/** `1 to 7`, or `7` for a period inside one lap; `null` when the race carries no laps. */
function lapRange(period: NeutralisationPeriod): string | null {
  const { fromLap, toLap } = period;
  if (fromLap === null || toLap === null) return null;
  return fromLap === toLap ? `${fromLap}` : `${fromLap} to ${toLap}`;
}

/** `a, b and c`, the way a sentence lists them. */
function sentenceList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * One sentence for the whole bar: what the race was neutralised by, and where.
 *
 * One sentence rather than one per band, because the bar is a time control and someone using it
 * wants to know what they will run into, not to navigate the race event by event — the feed does
 * that. A race running both kinds names each of them, since the bar tells them apart by pattern
 * alone. `null` when there is nothing to say, so the page renders no sentence at all.
 */
export function neutralisationSummary(periods: readonly NeutralisationPeriod[]): string | null {
  if (periods.length === 0) return null;
  const kinds = new Set(periods.map((period) => period.status));
  const count = countWord(periods.length);
  const plural = periods.length === 1 ? '' : 's';

  const first = periods[0];
  if (kinds.size === 1 && first !== undefined) {
    const ranges = periods.map(lapRange).filter((range) => range !== null);
    const head = `${count} ${NEUTRALISATION_NAMES[first.status]} period${plural}`;
    if (ranges.length === 0) return `${capitalise(head)}.`;
    const word = periods.length === 1 && first.fromLap === first.toLap ? 'lap' : 'laps';
    return `${capitalise(head)}: ${word} ${sentenceList(ranges)}.`;
  }

  const parts = periods.map((period) => {
    const range = lapRange(period);
    const name = NEUTRALISATION_NAMES[period.status];
    if (range === null) return name;
    return `${name} ${period.fromLap === period.toLap ? 'lap' : 'laps'} ${range}`;
  });
  return `${capitalise(`${count} neutralisation period${plural}`)}: ${sentenceList(parts)}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The best speed-trap reading of the race up to `elapsedMs`, and who set it. */
export function speedTrapBestAt(
  race: ReplayRace,
  elapsedMs: number,
): { driverId: string; code: string; speedKph: number } | null {
  const index = indexTiming(race);
  const count = countAtOrBefore(index.speedAts, elapsedMs);
  const best = count === 0 ? undefined : index.speedBest[count - 1];
  if (best === undefined) return null;
  const code = race.drivers.find((driver) => driver.id === best.driverId)?.code ?? best.driverId;
  return { driverId: best.driverId, code, speedKph: best.speedKph };
}
