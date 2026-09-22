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

/**
 * The best lap a driver has set up to and including `lap`, in seconds. Scanning the laps each
 * time keeps the function pure and costs a few thousand comparisons for a full grand prix.
 */
function bestLapSoFar(race: ReplayRace, driverId: string, lap: number): number | null {
  let best: number | null = null;
  for (const entry of race.laps) {
    if (entry.lap > lap) break;
    const row = entry.rows.find((item) => item.driverId === driverId);
    const time = row?.lapTimeMs ?? null;
    if (time !== null && (best === null || time < best)) best = time;
  }
  return toSeconds(best);
}

/**
 * The tower rows for one lap. Drivers missing from the lap have retired, and they are simply
 * absent: the tower animates them out rather than showing a stale position.
 *
 * `previousLap` is the lap the position change is measured against. Without it every row reads
 * as unchanged, which is what the first lap of a replay should show.
 */
export function replayRowsForLap(race: ReplayRace, lap: number, previousLap?: number): TimingRow[] {
  const entry = lapAt(race, lap);
  if (!entry) return [];

  const before = previousLap === undefined ? undefined : lapAt(race, previousLap);

  return entry.rows.map((row) => {
    const was = before?.rows.find((item) => item.driverId === row.driverId);
    return {
      driverId: row.driverId,
      position: row.position,
      gapToLeader: toSeconds(row.gapToLeaderMs),
      interval: toSeconds(row.intervalMs),
      lastLapTime: toSeconds(row.lapTimeMs),
      bestLapTime: bestLapSoFar(race, row.driverId, lap),
      sectors: sectors(),
      tyre: { ...PLACEHOLDER_TYRE },
      inPit: row.inPit,
      lapped: row.lapsBehind > 0,
      lapsBehind: row.lapsBehind,
      drs: row.overtake,
      positionChange: was === undefined ? 0 : was.position - row.position,
    };
  });
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
  /** 0 at the start of the lap, approaching 1 at the line. */
  progress: number;
  /** Laps completed plus `progress`: the car's place along the race, for ordering cars. */
  distance: number;
};

/**
 * Which lap each car is on at `elapsedMs`, measured on that car's own clock.
 *
 * A car is on lap N from its cumulative time at the end of lap N-1 until its cumulative time at
 * the end of lap N. That differs from the leader's lap: a car a minute behind is still finishing
 * lap N when the leader starts lap N+1, and a lapped car is a whole lap further back. Keying every
 * car to the leader's lap is what made cars jump back to the start line at each lap boundary.
 *
 * A car with no lap in progress — it has retired, or its cumulative time is unknown — is absent.
 * A lap that does not follow the car's previous one (a gap in the source) cannot be timed, so the
 * car is absent for it too, rather than placed at a guess.
 */
export function carLapsAt(race: ReplayRace, elapsedMs: number): Map<string, CarLap> {
  const cars = new Map<string, CarLap>();
  /** The end of each car's previous lap: the lap number and the cumulative time at the line. */
  const lastLine = new Map<string, { lap: number; at: number }>();

  for (const entry of race.laps) {
    for (const row of entry.rows) {
      const previous = lastLine.get(row.driverId);
      const start = entry.lap === 1 ? 0 : previous?.lap === entry.lap - 1 ? previous.at : null;

      if (row.cumulativeMs === null) lastLine.delete(row.driverId);
      else lastLine.set(row.driverId, { lap: entry.lap, at: row.cumulativeMs });

      if (start === null || row.cumulativeMs === null || row.cumulativeMs <= start) continue;
      if (cars.has(row.driverId) || elapsedMs < start || elapsedMs >= row.cumulativeMs) continue;

      const progress = (elapsedMs - start) / (row.cumulativeMs - start);
      cars.set(row.driverId, { lap: entry.lap, row, progress, distance: entry.lap - 1 + progress });
    }
  }
  return cars;
}

/**
 * Where each car sits on the track at `elapsedMs`, as progress from 0 to 1 around its own lap.
 *
 * The replay carries one time per lap, so a car is assumed to circulate at a constant speed. It
 * is an interpolation, not telemetry, and the page says so. The car furthest along the race is
 * emphasised as the leader. Markers keep the order of `race.drivers`, so the Track Map sees a
 * stable list and animates each car rather than re-keying the set.
 */
export function replayProgress(race: ReplayRace, elapsedMs: number): TrackMarker[] {
  const cars = carLapsAt(race, elapsedMs);
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
