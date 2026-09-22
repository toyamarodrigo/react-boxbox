import type {
  ReplayDriverStints,
  ReplayFinishStatus,
  ReplayLap,
  ReplayLapRow,
  ReplayResult,
  ReplayStint,
  ReplayTyreCompound,
} from './replay-schema';

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
        // Timing is a second source: `withTiming` fills these when OpenF1 has the race.
        sectorMs: [null, null, null],
        speedTrapKph: null,
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

/** The OpenF1 rows a compound join needs, as that API returns them. */
export type RawOpenF1Driver = { driver_number?: number | null; name_acronym?: string | null };
export type RawOpenF1Stint = {
  driver_number?: number | null;
  stint_number?: number | null;
  lap_start?: number | null;
  lap_end?: number | null;
  compound?: string | null;
};

/** One row of OpenF1's `laps`: one car, one lap. Durations are seconds, speeds km/h. */
export type RawOpenF1Lap = {
  driver_number?: number | null;
  lap_number?: number | null;
  duration_sector_1?: number | null;
  duration_sector_2?: number | null;
  duration_sector_3?: number | null;
  st_speed?: number | null;
};

/** What the compound join takes: OpenF1's two payloads plus the race's own driver codes. */
export type OpenF1Compounds = {
  drivers: readonly RawOpenF1Driver[];
  stints: readonly RawOpenF1Stint[];
  /**
   * The race's drivers, id and code. The join is on the three-letter code, because the `number`
   * the older jolpica payloads carry is a classification number, not the car number OpenF1 keys
   * its rows by.
   */
  codes: readonly { id: string; code: string }[];
};

const COMPOUND_CODES: Record<string, ReplayTyreCompound> = {
  SOFT: 'S',
  MEDIUM: 'M',
  HARD: 'H',
  INTERMEDIATE: 'I',
  WET: 'W',
};

/** OpenF1's compound name as a boxbox compound. Anything else — `UNKNOWN`, a test tyre — is null. */
export function tyreCompoundOf(compound: string | null | undefined): ReplayTyreCompound | null {
  return COMPOUND_CODES[compound?.trim().toUpperCase() ?? ''] ?? null;
}

/**
 * How far an OpenF1 `lap_start` may sit from a jolpica stint's first lap and still be the same
 * set of tyres.
 *
 * The two sources count the out-lap differently, and OpenF1 is not even consistent with itself:
 * for a stop on lap 16 it reported `lap_start: 17` in Las Vegas 2023 (the out-lap, which is what
 * jolpica's next stint starts on) and `lap_start: 16` in Australia 2025 (the in-lap). One lap of
 * tolerance covers both; more would let a short stint claim a set two stops away.
 */
export const COMPOUND_LAP_TOLERANCE = 1;

/** OpenF1's car numbers mapped to the three-letter codes both sources share. */
function acronymsByNumber(drivers: readonly RawOpenF1Driver[]): Map<number, string> {
  const acronyms = new Map<number, string>();
  for (const driver of drivers) {
    const code = driver.name_acronym?.trim().toUpperCase();
    if (driver.driver_number == null || !code) continue;
    acronyms.set(driver.driver_number, code);
  }
  return acronyms;
}

/** OpenF1 stints by driver code, in lap order. Rows with no `lap_start` cannot be matched. */
function compoundsByCode(source: OpenF1Compounds): Map<string, RawOpenF1Stint[]> {
  const acronyms = acronymsByNumber(source.drivers);

  const byCode = new Map<string, RawOpenF1Stint[]>();
  for (const stint of source.stints) {
    if (stint.driver_number == null || stint.lap_start == null) continue;
    const code = acronyms.get(stint.driver_number);
    if (code === undefined) continue;
    const list = byCode.get(code) ?? [];
    list.push(stint);
    byCode.set(code, list);
  }
  for (const list of byCode.values()) {
    list.sort((a, b) => (a.lap_start ?? 0) - (b.lap_start ?? 0));
  }
  return byCode;
}

/**
 * The compound for each of a car's stints: the OpenF1 stint whose `lap_start` is nearest the
 * jolpica stint's first lap, within the tolerance, and the earlier one when two are equally
 * near. A stint with no candidate in range keeps `null`.
 *
 * Two jolpica stints may land on the same OpenF1 stint, and deliberately so: with a stop on
 * consecutive laps — a red-flag restart, a double stop — the tolerance makes both fit, and
 * every candidate in range is an adjacent set, so the compound is right either way. Spending
 * each OpenF1 stint once instead left the long stint after a restart with no compound at all.
 */
function matchCompounds(
  stints: readonly ReplayStint[],
  candidates: readonly RawOpenF1Stint[],
): (ReplayTyreCompound | null)[] {
  return stints.map((stint) => {
    let best: RawOpenF1Stint | undefined;
    let closest = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const distance = Math.abs((candidate.lap_start ?? 0) - stint.fromLap);
      if (distance > COMPOUND_LAP_TOLERANCE || distance >= closest) continue;
      best = candidate;
      closest = distance;
    }
    return best === undefined ? null : tyreCompoundOf(best.compound);
  });
}

/**
 * Turns the derived laps into one list of stints per car.
 *
 * The cuts come from the pit stops alone: jolpica records every one of them, so a car's stints
 * are lap 1 to its first stop, then stop to stop, and the last one ends at the lap the car
 * finished on. A car that never stopped has a single stint over the whole race, and a stop on
 * the final lap adds no stint after it.
 *
 * `openF1Stints` only ever adds the compound, never a cut: it is a second source, joined by
 * driver code, and it is incomplete. A car OpenF1 has no rows for, or a stint whose laps it
 * reports as `null`, keeps `compound: null`, which the page draws as an unknown grey bar.
 */
export function deriveStints(
  laps: readonly ReplayLap[],
  results: readonly ReplayResult[],
  openF1Stints?: OpenF1Compounds,
): ReplayDriverStints[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const stops = new Map<string, Set<number>>();
  const lastRowLap = new Map<string, number>();

  const remember = (driverId: string) => {
    if (seen.has(driverId)) return;
    seen.add(driverId);
    order.push(driverId);
  };

  // Results order first, so the list follows the classification; a car with lap rows but no
  // result still gets its stints.
  for (const result of results) remember(result.driverId);
  for (const lap of laps) {
    for (const row of lap.rows) {
      remember(row.driverId);
      lastRowLap.set(row.driverId, Math.max(lastRowLap.get(row.driverId) ?? 0, lap.lap));
      if (!row.inPit && row.pitStop === null) continue;
      const laid = stops.get(row.driverId) ?? new Set<number>();
      laid.add(lap.lap);
      stops.set(row.driverId, laid);
    }
  }

  const finalLaps = new Map(results.map((result) => [result.driverId, result.laps]));
  const codes = new Map(
    (openF1Stints?.codes ?? []).map((driver) => [driver.id, driver.code.trim().toUpperCase()]),
  );
  const byCode = openF1Stints ? compoundsByCode(openF1Stints) : new Map<string, RawOpenF1Stint[]>();

  const all: ReplayDriverStints[] = [];
  for (const driverId of order) {
    const end = Math.max(finalLaps.get(driverId) ?? 0, lastRowLap.get(driverId) ?? 0);
    // A car that never got away has no stint to draw.
    if (end < 1) continue;

    // A stop on the last lap the car ran closes the race rather than opening another stint.
    const cuts = [...(stops.get(driverId) ?? [])]
      .filter((lap) => lap >= 1 && lap < end)
      .sort((a, b) => a - b);

    const stints: ReplayStint[] = [];
    let fromLap = 1;
    for (const cut of cuts) {
      stints.push({ fromLap, toLap: cut, compound: null });
      fromLap = cut + 1;
    }
    stints.push({ fromLap, toLap: end, compound: null });

    const candidates = byCode.get(codes.get(driverId) ?? '') ?? [];
    const compounds = matchCompounds(stints, candidates);
    all.push({
      driverId,
      stints: stints.map((stint, index) => ({ ...stint, compound: compounds[index] ?? null })),
    });
  }
  return all;
}

/** What the timing join takes: OpenF1's `laps` and `drivers` plus the race's own driver codes. */
export type OpenF1Timing = {
  drivers: readonly RawOpenF1Driver[];
  laps: readonly RawOpenF1Lap[];
  /** Same join as the compounds: the three-letter code, never the jolpica `number` field. */
  codes: readonly { id: string; code: string }[];
};

/** Seconds as whole milliseconds. A missing or non-finite figure is no figure at all. */
function sectorMsOf(seconds: number | null | undefined): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds * 1000)
    : null;
}

/**
 * Merges OpenF1's per-lap timing into the derived laps: the three sector durations and the
 * speed-trap reading.
 *
 * The match is on **(driver code, lap number)**. Both sources number a car's laps from 1 and
 * count them the same way: measured on 2025 Australia (session 9693) for NOR, VER and RUS, 56 of
 * the 57 comparable laps agree to within 60 ms with no offset (mean 5–8 ms), while an offset of
 * ±1 agrees on at most two and averages ~8 s out. Only lap 1 differs, by 0.3–0.5 s, because the
 * two sources time the start from different moments. So no offset is applied.
 *
 * A car OpenF1 has no rows for, or a lap it has no row for, keeps the schema defaults. Rows are
 * copied rather than mutated, so the caller's laps stay untouched.
 */
export function withTiming(laps: readonly ReplayLap[], timing: OpenF1Timing): ReplayLap[] {
  const acronyms = acronymsByNumber(timing.drivers);
  const codes = new Map(
    timing.codes.map((driver) => [driver.id, driver.code.trim().toUpperCase()]),
  );

  const byCodeAndLap = new Map<string, RawOpenF1Lap>();
  for (const row of timing.laps) {
    if (row.driver_number == null || row.lap_number == null) continue;
    const code = acronyms.get(row.driver_number);
    if (code === undefined) continue;
    byCodeAndLap.set(`${code}:${row.lap_number}`, row);
  }

  return laps.map((lap) => ({
    lap: lap.lap,
    rows: lap.rows.map((row) => {
      const found = byCodeAndLap.get(`${codes.get(row.driverId) ?? ''}:${lap.lap}`);
      if (found === undefined) return { ...row };
      const speed = found.st_speed;
      return {
        ...row,
        sectorMs: [
          sectorMsOf(found.duration_sector_1),
          sectorMsOf(found.duration_sector_2),
          sectorMsOf(found.duration_sector_3),
        ] satisfies ReplayLapRow['sectorMs'],
        speedTrapKph:
          typeof speed === 'number' && Number.isFinite(speed) && speed > 0
            ? Math.round(speed)
            : null,
      };
    }),
  }));
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
