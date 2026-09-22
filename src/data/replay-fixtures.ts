import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReplayIndex, ReplayLap, ReplayLapRow, ReplayRace } from './replay-schema';

/**
 * Test-only access to the dataset written by `bun run replays:build`. The tests that use it skip
 * when nothing has been generated yet, so a fresh checkout without the JSON still runs green.
 * Nothing here touches the network.
 */
const replayDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'data',
  'replays',
);

export function generatedReplayFiles(): string[] {
  if (!existsSync(replayDir)) return [];
  return readdirSync(replayDir)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .sort()
    .map((name) => path.join(replayDir, name));
}

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export const replayIndexFile = path.join(replayDir, 'index.json');

/** What a fixture row may say about its timing; anything left out is derived from the lap time. */
type FixtureTiming = Partial<Pick<ReplayLapRow, 'sectorMs' | 'speedTrapKph'>>;

/**
 * A fixture lap's sectors are the lap time split 30/35/35, with the rounding remainder in S3 so
 * the three always sum to it, and the speed trap falls as the lap time rises. Derived rather than
 * tabulated, so the numbers stay consistent with the lap times a test asserts on.
 */
function fixtureTiming(lapTimeMs: number, override: FixtureTiming): Required<FixtureTiming> {
  const s1 = Math.round(lapTimeMs * 0.3);
  const s2 = Math.round(lapTimeMs * 0.35);
  return {
    sectorMs: override.sectorMs ?? [s1, s2, lapTimeMs - s1 - s2],
    speedTrapKph:
      override.speedTrapKph === undefined
        ? 340 - Math.round(lapTimeMs / 1000)
        : override.speedTrapKph,
  };
}

/**
 * A hand-written race small enough to reason about: four cars, three laps, one car a lap down
 * and one retirement on the last lap. The numbers are round so a test can assert on them
 * without arithmetic. Nothing here is real, and nothing here comes off the network.
 *
 * Leader cumulative times are 100000, 199000 and 297000, which are the replay's lap boundaries.
 */
export function testReplayRace(): ReplayRace {
  const lap = (
    number: number,
    rows: [string, number, number, number, number, number | null, number, FixtureTiming?][],
  ): ReplayLap => ({
    lap: number,
    rows: rows.map(
      ([
        driverId,
        position,
        lapTimeMs,
        cumulativeMs,
        gapToLeaderMs,
        intervalMs,
        lapsBehind,
        timing = {},
      ]) => ({
        driverId,
        position,
        lapTimeMs,
        cumulativeMs,
        gapToLeaderMs,
        intervalMs,
        inPit: false,
        pitDurationMs: null,
        pitStop: null,
        overtake: intervalMs !== null && intervalMs < 1500 && position > 1,
        lapsBehind,
        ...fixtureTiming(lapTimeMs, timing),
      }),
    ),
  });

  return {
    id: '2030-1',
    season: 2030,
    round: 1,
    name: 'Test Grand Prix',
    circuit: 'Test Circuit',
    date: '2030-03-01',
    totalLaps: 3,
    source: {
      provider: 'jolpica-f1',
      fetchedAt: '2030-03-01T12:00:00.000Z',
      url: 'https://example.invalid/2030/1.json',
    },
    drivers: [
      { id: 'alpha', code: 'ALP', number: 1, firstName: 'Ada', lastName: 'Alpha', teamId: 'red' },
      { id: 'bravo', code: 'BRA', number: 2, firstName: 'Bo', lastName: 'Bravo', teamId: 'blue' },
      {
        id: 'charlie',
        code: 'CHA',
        number: 3,
        firstName: 'Cy',
        lastName: 'Charlie',
        teamId: 'red',
      },
      { id: 'delta', code: 'DEL', number: 4, firstName: 'Di', lastName: 'Delta', teamId: 'blue' },
    ],
    teams: [
      { id: 'red', name: 'Red Team', color: '#ff0000' },
      { id: 'blue', name: 'Blue Team', color: '#0000ff' },
    ],
    laps: [
      lap(1, [
        ['alpha', 1, 100_000, 100_000, 0, null, 0],
        ['bravo', 2, 101_000, 101_000, 1000, 1000, 0],
        ['charlie', 3, 160_000, 160_000, 60_000, 59_000, 0],
        ['delta', 4, 165_000, 165_000, 65_000, 5000, 0],
      ]),
      lap(2, [
        ['bravo', 1, 98_000, 199_000, 0, null, 0],
        ['alpha', 2, 100_000, 200_000, 1000, 1000, 0],
        // Charlie loses a middle sector, and delta has no timing at all: the two gaps OpenF1
        // leaves behind, a sector it never published and a car it has no rows for.
        [
          'charlie',
          3,
          160_000,
          320_000,
          121_000,
          120_000,
          1,
          { sectorMs: [52_000, null, 108_000] },
        ],
        [
          'delta',
          4,
          161_000,
          326_000,
          127_000,
          6000,
          1,
          { sectorMs: [null, null, null], speedTrapKph: null },
        ],
      ]),
      // Delta retired, so it is simply absent from the last lap.
      lap(3, [
        ['bravo', 1, 98_000, 297_000, 0, null, 0],
        ['alpha', 2, 99_000, 299_000, 2000, 2000, 0],
        ['charlie', 3, 158_000, 478_000, 181_000, 179_000, 1],
      ]),
    ],
    results: [
      {
        driverId: 'bravo',
        position: 1,
        positionText: '1',
        grid: 2,
        points: 25,
        laps: 3,
        status: 'Finished',
        finishStatus: 'finished',
        timeMs: 297_000,
        gapToWinnerMs: 0,
        lapsBehind: 0,
      },
      {
        driverId: 'alpha',
        position: 2,
        positionText: '2',
        grid: 1,
        points: 18,
        laps: 3,
        status: 'Finished',
        finishStatus: 'finished',
        timeMs: null,
        gapToWinnerMs: 2000,
        lapsBehind: 0,
      },
      {
        driverId: 'charlie',
        position: 3,
        positionText: '3',
        grid: 5,
        points: 15,
        laps: 3,
        status: '+1 Lap',
        finishStatus: 'finished',
        timeMs: null,
        gapToWinnerMs: null,
        lapsBehind: 1,
      },
      {
        driverId: 'delta',
        position: 4,
        positionText: 'R',
        grid: 0,
        points: 0,
        laps: 2,
        status: 'Retired',
        finishStatus: 'dnf',
        timeMs: null,
        gapToWinnerMs: null,
        lapsBehind: 0,
      },
    ],
    // Alpha runs the race on one set, bravo and charlie stop once, and delta's compound is
    // unknown: the grey "?" case every stint bar has to draw.
    stints: [
      {
        driverId: 'bravo',
        stints: [
          { fromLap: 1, toLap: 1, compound: 'S' },
          { fromLap: 2, toLap: 3, compound: 'H' },
        ],
      },
      { driverId: 'alpha', stints: [{ fromLap: 1, toLap: 3, compound: 'M' }] },
      {
        driverId: 'charlie',
        stints: [
          { fromLap: 1, toLap: 2, compound: 'M' },
          { fromLap: 3, toLap: 3, compound: 'S' },
        ],
      },
      { driverId: 'delta', stints: [{ fromLap: 1, toLap: 2, compound: null }] },
    ],
    /**
     * One of every kind of message the real source sends, on a clock a test can read: a session
     * note that changes nothing, a local flag in two neighbouring sectors, a virtual safety car
     * with its own ending, a clear for one of the two zones, a message addressed to one car, a
     * track-wide double yellow, and the green that puts everything out.
     *
     * The highest sector any of them mentions is 4, so a flagged sector is a quarter of the lap.
     */
    raceControl: [
      {
        atMs: 0,
        lap: 1,
        flag: null,
        category: 'SessionStatus',
        scope: null,
        sector: null,
        driverId: null,
        message: 'GREEN LIGHT - PIT EXIT OPEN',
      },
      {
        atMs: 20_000,
        lap: 1,
        flag: 'CLEAR',
        category: 'Flag',
        scope: 'Sector',
        sector: 4,
        driverId: null,
        message: 'CLEAR IN TRACK SECTOR 4',
      },
      {
        atMs: 30_000,
        lap: 1,
        flag: 'YELLOW',
        category: 'Flag',
        scope: 'Sector',
        sector: 2,
        driverId: null,
        message: 'YELLOW IN TRACK SECTOR 2',
      },
      {
        atMs: 35_000,
        lap: 1,
        flag: 'YELLOW',
        category: 'Flag',
        scope: 'Sector',
        sector: 3,
        driverId: null,
        message: 'YELLOW IN TRACK SECTOR 3',
      },
      {
        atMs: 60_000,
        lap: 1,
        flag: null,
        category: 'SafetyCar',
        scope: null,
        sector: null,
        driverId: null,
        message: 'VSC DEPLOYED',
      },
      {
        atMs: 120_000,
        lap: 2,
        flag: null,
        category: 'SafetyCar',
        scope: null,
        sector: null,
        driverId: null,
        message: 'VSC ENDING',
      },
      {
        atMs: 150_000,
        lap: 2,
        flag: 'CLEAR',
        category: 'Flag',
        scope: 'Sector',
        sector: 2,
        driverId: null,
        message: 'CLEAR IN TRACK SECTOR 2',
      },
      {
        atMs: 210_000,
        lap: 3,
        flag: 'BLACK AND WHITE',
        category: 'Flag',
        scope: 'Driver',
        sector: null,
        driverId: 'charlie',
        message: 'BLACK AND WHITE FLAG FOR CAR 3 (CHA) - TRACK LIMITS',
      },
      {
        atMs: 250_000,
        lap: 3,
        flag: 'DOUBLE YELLOW',
        category: 'Flag',
        scope: 'Track',
        sector: null,
        driverId: null,
        message: 'DOUBLE YELLOW IN TRACK',
      },
      {
        atMs: 280_000,
        lap: 3,
        flag: 'GREEN',
        category: 'Flag',
        scope: 'Track',
        sector: null,
        driverId: null,
        message: 'GREEN LIGHT - TRACK CLEAR',
      },
    ],
  };
}

/** The index the test race would appear in. */
export function testReplayIndex(): ReplayIndex {
  const race = testReplayRace();
  return {
    generatedAt: '2030-03-01T12:00:00.000Z',
    races: [
      {
        id: race.id,
        season: race.season,
        round: race.round,
        name: race.name,
        circuit: race.circuit,
        date: race.date,
        totalLaps: race.totalLaps,
        driverCount: race.drivers.length,
        winnerCode: 'BRA',
      },
    ],
  };
}
