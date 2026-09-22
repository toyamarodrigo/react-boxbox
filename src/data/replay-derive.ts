import type { ReplayFinishStatus, ReplayLap, ReplayLapRow, ReplayResult } from './replay-schema';

/** The subset of the Ergast-compatible payload the derivation needs. */
export type RawTiming = { driverId: string; position: string; time: string };
export type RawLap = { number: string; Timings: RawTiming[] };
export type RawPitStop = { driverId: string; lap: string; stop?: string; duration?: string };
export type RawResult = {
  position: string;
  positionText: string;
  points: string;
  laps: string;
  status: string;
  /** Grid slot, `0` for a pit-lane start. Absent in some older payloads. */
  grid?: string;
  Driver: { driverId: string };
  Time?: { millis?: string; time: string };
};

/**
 * Parses an Ergast duration into milliseconds. Accepts `31.512`, `1:31.512` and the
 * `1:32:04.117` shape used by a winner's race time. Returns `null` for anything else, so a
 * malformed value degrades into a gap the page simply does not show.
 */
export function parseLapTime(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split(':');
  if (parts.length > 3) return null;

  const seconds = parts.at(-1) ?? '';
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(seconds)) return null;

  let total = Math.round(Number.parseFloat(seconds) * 1000);
  for (const [index, part] of parts.slice(0, -1).reverse().entries()) {
    if (!/^\d{1,3}$/.test(part)) return null;
    total += Number.parseInt(part, 10) * (index === 0 ? 60_000 : 3_600_000);
  }
  return total;
}

/** Parses a signed gap such as `+4.512` or `+1:12.345`. A bare duration is accepted too. */
export function parseGap(value: string): number | null {
  const trimmed = value.trim();
  return parseLapTime(trimmed.startsWith('+') ? trimmed.slice(1) : trimmed);
}

/** A grid slot. `0` is a pit-lane start, which the source reports as a slot of its own. */
function parseGrid(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? '';
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

/**
 * `+1 Lap` / `+3 Laps` in a result status means the car finished that many laps down. Newer
 * seasons say only `Lapped`; the count then comes from the laps the car completed against the
 * winner's (`winnerLaps`), when the caller has it.
 */
function lapsBehindFromStatus(status: string, laps = 0, winnerLaps = 0): number {
  const clean = status.trim();
  if (clean === 'Lapped') return Math.max(1, winnerLaps - laps);
  const count = /^\+(\d+)\s+Laps?$/.exec(clean)?.[1];
  return count === undefined ? 0 : Number.parseInt(count, 10);
}

/**
 * Maps an Ergast `status` / `positionText` pair onto the boxbox `FinishStatus` union.
 * `positionText` wins where it is unambiguous: `D` disqualified, `W` withdrew, `R` retired.
 * Everything that is not `Finished`, `+N Lap(s)` or `Lapped` is a retirement.
 */
export function finishStatusOf(status: string, positionText: string): ReplayFinishStatus {
  const text = positionText.trim();
  const clean = status.trim();

  if (text === 'D' || clean === 'Disqualified') return 'dsq';
  if (text === 'W' || clean === 'Did not start' || clean === 'Withdrew') return 'dns';
  if (clean === 'Finished' || lapsBehindFromStatus(clean) > 0) return 'finished';
  return 'dnf';
}

/**
 * Turns raw lap timings and pit stops into the per-lap rows the replay page plays back.
 *
 * - `cumulativeMs` is a running sum of lap times per driver. One unparseable or missing lap
 *   poisons the rest of that driver's race, because every later total would be wrong.
 * - `gapToLeaderMs` compares against the car in position 1 on the same lap, clamped at zero.
 * - `intervalMs` compares against the car one position ahead on the same lap.
 * - `overtake` marks a car within a second of the one ahead, outside the pits, off the lead:
 *   the DRS-range situation the Timing Tower highlights. It is a proximity flag, not a
 *   confirmed pass, because lap timings carry no sector-by-sector order.
 * - `lapsBehind` divides the gap to the leader by the leader's own last lap time, so a car is
 *   one lap down as soon as it trails by more than a lap of running. It is recomputed every
 *   lap rather than latched, because a car can unlap itself: under the 2021 Abu Dhabi safety
 *   car five lapped cars were waved past and finished on the lead lap, and a latched flag left
 *   all of them contradicting their own classification. The trade is that a lap down can flicker
 *   off for a lap while the leader is in the pits. The final classification does not depend on
 *   this field: `ReplayResult.lapsBehind` comes from the `+N Lap(s)` status instead.
 */
export function deriveLaps(rawLaps: RawLap[], rawPitStops: RawPitStop[]): ReplayLap[] {
  const pits = new Map(
    rawPitStops.map((stop) => [`${Number.parseInt(stop.lap, 10)}:${stop.driverId}`, stop]),
  );

  const cumulatives = new Map<string, number | null>();
  const sorted = [...rawLaps].sort(
    (a, b) => Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10),
  );

  const laps: ReplayLap[] = [];
  let leaderLapMs: number | null = null;

  for (const rawLap of sorted) {
    const lap = Number.parseInt(rawLap.number, 10);

    const timings = [...rawLap.Timings].sort(
      (a, b) => Number.parseInt(a.position, 10) - Number.parseInt(b.position, 10),
    );

    const rows: ReplayLapRow[] = timings.map((timing) => {
      // `has` rather than `??`, so a poisoned `null` total is not reset to zero.
      const previous: number | null = cumulatives.has(timing.driverId)
        ? (cumulatives.get(timing.driverId) ?? null)
        : 0;
      const lapTimeMs = parseLapTime(timing.time);
      const cumulativeMs = previous === null || lapTimeMs === null ? null : previous + lapTimeMs;
      cumulatives.set(timing.driverId, cumulativeMs);

      const stop = pits.get(`${lap}:${timing.driverId}`);
      const stopNumber = stop?.stop === undefined ? null : Number.parseInt(stop.stop, 10);
      return {
        driverId: timing.driverId,
        position: Number.parseInt(timing.position, 10),
        lapTimeMs,
        cumulativeMs,
        gapToLeaderMs: null,
        intervalMs: null,
        inPit: stop !== undefined,
        // The source's `duration` is the time spent in the pit lane, entry to exit.
        pitDurationMs: stop?.duration === undefined ? null : parseLapTime(stop.duration),
        pitStop:
          stopNumber === null || Number.isNaN(stopNumber) || stopNumber < 1 ? null : stopNumber,
        overtake: false,
        lapsBehind: 0,
      };
    });

    const leader = rows.find((row) => row.position === 1);
    if (leader?.lapTimeMs !== null && leader?.lapTimeMs !== undefined) {
      leaderLapMs = leader.lapTimeMs;
    }

    for (const [index, row] of rows.entries()) {
      const ahead = index > 0 ? rows[index - 1] : undefined;

      if (leader && leader.cumulativeMs !== null && row.cumulativeMs !== null) {
        row.gapToLeaderMs = Math.max(0, row.cumulativeMs - leader.cumulativeMs);
      }
      if (ahead && ahead.cumulativeMs !== null && row.cumulativeMs !== null) {
        row.intervalMs = Math.max(0, row.cumulativeMs - ahead.cumulativeMs);
      }
      row.overtake =
        row.intervalMs !== null && row.intervalMs < 1000 && !row.inPit && row.position > 1;

      if (row.gapToLeaderMs !== null && leaderLapMs !== null && leaderLapMs > 0) {
        row.lapsBehind = Math.floor(row.gapToLeaderMs / leaderLapMs);
      }
    }

    laps.push({ lap, rows });
  }

  return laps;
}

/**
 * Turns raw results into the classification the replay shows once the chequered flag is out.
 * `timeMs` is the absolute race time, which Ergast only gives for the winner; everyone else
 * carries a `+gap` string, which becomes `gapToWinnerMs`.
 */
export function deriveResults(rawResults: RawResult[]): ReplayResult[] {
  // The race distance: what a `Lapped` car is measured against.
  const winnerLaps = Math.max(0, ...rawResults.map((result) => Number.parseInt(result.laps, 10)));

  return rawResults.map((result) => {
    const raw = result.Time?.time.trim();
    const isGap = raw !== undefined && raw.startsWith('+');
    const laps = Number.parseInt(result.laps, 10);

    return {
      driverId: result.Driver.driverId,
      position: /^\d+$/.test(result.position) ? Number.parseInt(result.position, 10) : null,
      positionText: result.positionText,
      grid: parseGrid(result.grid),
      points: Number.parseFloat(result.points),
      laps,
      status: result.status,
      finishStatus: finishStatusOf(result.status, result.positionText),
      timeMs: raw === undefined || isGap ? null : parseLapTime(raw),
      gapToWinnerMs: raw === undefined ? null : isGap ? parseGap(raw) : 0,
      lapsBehind: lapsBehindFromStatus(result.status, laps, winnerLaps),
    };
  });
}
