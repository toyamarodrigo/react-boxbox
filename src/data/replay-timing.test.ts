import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FinishStatus } from '@/registry/boxbox/lib/types';
import { circuitById } from './circuits';
import { generatedReplayFiles, readJson, testReplayRace } from './replay-fixtures';
import { type ReplayRace, type ReplayRaceControl, replayRaceSchema } from './replay-schema';
import {
  type CarLap,
  carLapsAt,
  emphasiseMarker,
  flaggedSectorsAt,
  followedDriverId,
  formatRaceTime,
  leaderCumulative,
  leaderLapsCompleted,
  neutralisationPeriods,
  neutralisationSummary,
  overtakeModeFor,
  positionsGained,
  raceControlUpTo,
  replayGaps,
  replayLiveRows,
  replayPitStops,
  replayPodium,
  replayProgress,
  replayResultsRows,
  sectorCardAt,
  sectorStatusesAt,
  speedTrapAt,
  speedTrapBestAt,
  stintAt,
  trackStatusAt,
} from './replay-timing';
import { WHOLE_LAP, distanceAt } from './speed-profile';

const race = testReplayRace();

/** A race-control message with only the fields a case cares about. */
const message = (
  atMs: number,
  fields: Partial<ReplayRaceControl> & { message: string },
): ReplayRaceControl => ({
  atMs,
  lap: 1,
  flag: null,
  category: 'Flag',
  scope: null,
  sector: null,
  driverId: null,
  ...fields,
});

describe('replayLiveRows', () => {
  it('lists the grid in drivers order at the start, with placeholders for what the data lacks', () => {
    const rows = replayLiveRows(race, 0);
    expect(rows.map((row) => row.driverId)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);

    // Nobody has a gap on the grid, and the aid is off for the opening lap.
    const leader = rows[0];
    expect(leader?.gapToLeader).toBeNull();
    expect(leader?.interval).toBeNull();
    expect(rows[1]?.gapToLeader).toBeNull();
    expect(rows[1]?.interval).toBeNull();
    expect(rows.every((row) => row.drs === false)).toBe(true);
    expect(replayLiveRows(race, 50_000).every((row) => row.drs === false)).toBe(true);
    expect(replayLiveRows(race, 50_000)[1]?.gapToLeader).toBeCloseTo(0.5, 2);
    expect(leader?.lastLapTime).toBeNull();
    expect(leader?.bestLapTime).toBeNull();
    expect(leader?.positionChange).toBe(0);
    expect(leader?.sectors).toEqual([
      { time: null, status: 'unset' },
      { time: null, status: 'unset' },
      { time: null, status: 'unset' },
    ]);
    expect(leader?.tyre).toEqual({ compound: 'M', age: 0 });
  });

  it('orders by interpolated distance and measures how long ago the car ahead was there', () => {
    // Bravo has just completed lap two; alpha is 1% of a lap short of the line.
    const rows = replayLiveRows(race, 199_000);
    expect(rows.map((row) => row.driverId)).toEqual(['bravo', 'alpha', 'charlie', 'delta']);

    const [bravo, alpha, charlie, delta] = rows;
    expect(bravo?.gapToLeader).toBe(0);
    expect(bravo?.interval).toBeNull();
    // Bravo passed alpha's point at 101000 + 0.99 × 98000 = 198020.
    expect(alpha?.gapToLeader).toBeCloseTo(0.98);
    expect(alpha?.interval).toBeCloseTo(0.98);
    expect(alpha?.drs).toBe(true);
    // Charlie is 0.24375 into lap two; bravo was there at 124887.5, alpha at 124375.
    expect(charlie?.gapToLeader).toBeCloseTo(74.1125);
    expect(charlie?.interval).toBeCloseTo(74.625);
    expect(charlie?.drs).toBe(false);
    expect(delta?.gapToLeader).toBeCloseTo(77.30435, 3);
    expect(delta?.interval).toBeCloseTo(5.2112, 3);

    expect(bravo?.lastLapTime).toBe(98);
    expect(bravo?.bestLapTime).toBe(98);
    expect(alpha?.lastLapTime).toBe(100);
    expect(alpha?.bestLapTime).toBe(100);
  });

  it('shows an overtake as soon as the interpolated cars cross, not at the leader line', () => {
    // Alpha leads until bravo, on a faster lap two, catches up before the line.
    expect(
      replayLiveRows(race, 150_000)
        .map((row) => row.driverId)
        .slice(0, 2),
    ).toEqual(['alpha', 'bravo']);
    const passed = replayLiveRows(race, 180_000);
    expect(passed.map((row) => row.driverId).slice(0, 2)).toEqual(['bravo', 'alpha']);
    // Bravo passed alpha's point (0.8 of lap two) at 179400: 600 ms ago, inside the aid range.
    expect(passed[1]?.interval).toBeCloseTo(0.6);
    expect(passed[1]?.drs).toBe(true);
  });

  it('matches the dataset gap when a car reaches the line', () => {
    // Charlie completes lap one at 160000, 60000 behind alpha, who led that lap. By then bravo
    // has taken the lead on the road, so the dataset figure is the interval to alpha in P2.
    const rows = replayLiveRows(race, 160_000);
    expect(rows.map((row) => row.driverId).slice(0, 3)).toEqual(['bravo', 'alpha', 'charlie']);
    expect(rows[2]?.interval).toBeCloseTo(60);
    expect(rows[2]?.gapToLeader).toBeCloseTo(59);
  });

  it('measures gaps at the moment given, so the numbers can refresh slower than the order', () => {
    const live = replayLiveRows(race, 199_500);
    const held = replayLiveRows(race, 199_500, { gapAtMs: 199_000 });
    expect(live.find((row) => row.driverId === 'alpha')?.gapToLeader).toBeCloseTo(0.99);
    expect(held.find((row) => row.driverId === 'alpha')?.gapToLeader).toBeCloseTo(0.98);
  });

  it('marks a car lapped once it is a whole lap of distance behind', () => {
    const early = replayLiveRows(race, 250_000).find((row) => row.driverId === 'charlie');
    expect(early?.lapped).toBe(false);
    const late = replayLiveRows(race, 290_000).find((row) => row.driverId === 'charlie');
    expect(late?.lapped).toBe(true);
    expect(late?.lapsBehind).toBe(1);
  });

  it('measures the position change against the order at the reference moment', () => {
    // At 100000 alpha led; by 199000 bravo has passed it.
    const rows = replayLiveRows(race, 199_000, { referenceMs: 100_000 });
    expect(rows.find((row) => row.driverId === 'bravo')?.positionChange).toBe(1);
    expect(rows.find((row) => row.driverId === 'alpha')?.positionChange).toBe(-1);
    expect(rows.find((row) => row.driverId === 'charlie')?.positionChange).toBe(0);
    expect(replayLiveRows(race, 199_000).every((row) => row.positionChange === 0)).toBe(true);
  });

  it('keeps a retired car listed after the running cars, as OUT', () => {
    // Delta is still on its lap two at 325999 and has no lap three.
    expect(replayLiveRows(race, 325_999).map((row) => row.driverId)).toContain('delta');
    const rows = replayLiveRows(race, 330_000);
    // Bravo and alpha have finished and are not out; charlie is still running its last lap.
    expect(rows.map((row) => row.driverId)).toEqual(['charlie', 'delta']);
    const delta = rows[1];
    expect(delta?.position).toBe(2);
    expect(delta?.finishStatus).toBe('dnf');
    expect(delta?.gapToLeader).toBeNull();
    expect(delta?.interval).toBeNull();
    expect(delta?.drs).toBe(false);
    expect(delta?.bestLapTime).toBe(161);
    expect(rows[0]?.finishStatus).toBeUndefined();
  });
});

describe('pit stops on the lane', () => {
  /** Charlie stops on lap two: 20 s in the lane, on a 160 s lap that ends at 320000. */
  const pitted: ReplayRace = {
    ...race,
    laps: race.laps.map((lap) =>
      lap.lap === 2
        ? {
            ...lap,
            rows: lap.rows.map((row) =>
              row.driverId === 'charlie'
                ? { ...row, inPit: true, pitDurationMs: 20_000, pitStop: 1 }
                : row,
            ),
          }
        : lap,
    ),
  };
  // The line sits halfway along the lane, so the car enters 10 s before it completes the lap.
  const shape = { entry: 0.9, exit: 0.1 };
  const charlieAt = (ms: number) => carLapsAt(pitted, ms, shape).get('charlie');

  it('lists the stop with the moment the car enters the lane', () => {
    expect(replayPitStops(pitted, shape)).toEqual([
      { driverId: 'charlie', code: 'CHA', lap: 2, stop: 1, atMs: 310_000, durationMs: 20_000 },
    ]);
    expect(replayPitStops(race, shape)).toEqual([]);
  });

  it('stretches the in-lap so the car reaches the entry as the stop begins', () => {
    expect(charlieAt(200_000)).toMatchObject({ lap: 2, inPit: false });
    expect(charlieAt(200_000)?.progress).toBeCloseTo(0.24);
    expect(charlieAt(309_999)?.progress).toBeCloseTo(0.9, 3);
  });

  it('runs the car along the lane for the stop, across the line, without a jump in distance', () => {
    expect(charlieAt(315_000)).toMatchObject({ lap: 2, inPit: true });
    expect(charlieAt(315_000)?.progress).toBeCloseTo(0.25);
    expect(charlieAt(315_000)?.distance).toBeCloseTo(1.95);
    // The lap changes under the car while it is still in the lane.
    expect(charlieAt(320_000)).toMatchObject({ lap: 3, inPit: true });
    expect(charlieAt(320_000)?.progress).toBeCloseTo(0.5);
    expect(charlieAt(320_000)?.distance).toBeCloseTo(2);
    expect(charlieAt(325_000)?.distance).toBeCloseTo(2.05);
  });

  it('rejoins at the exit and runs the rest of the out-lap to the line', () => {
    expect(charlieAt(330_000)).toMatchObject({ lap: 3, inPit: false });
    expect(charlieAt(330_000)?.progress).toBeCloseTo(0.1);
    expect(charlieAt(404_000)?.progress).toBeCloseTo(0.55);
  });

  it('flags the whole lap when the stop is not drawn, and when it cannot be', () => {
    // No shape: the lap's own flag stands, and progress is the plain constant-speed lap.
    expect(carLapsAt(pitted, 315_000).get('charlie')).toMatchObject({ inPit: true });
    expect(carLapsAt(pitted, 315_000).get('charlie')?.progress).toBeCloseTo(0.96875);
    expect(carLapsAt(pitted, 200_000).get('charlie')).toMatchObject({ inPit: true });
    // A stop longer than the lap it sits in cannot be placed on the lane.
    const endless: ReplayRace = {
      ...pitted,
      laps: pitted.laps.map((lap) => ({
        ...lap,
        rows: lap.rows.map((row) =>
          row.pitDurationMs === null ? row : { ...row, pitDurationMs: 1_000_000 },
        ),
      })),
    };
    expect(carLapsAt(endless, 200_000, shape).get('charlie')).toMatchObject({ inPit: true });
    expect(carLapsAt(endless, 200_000, shape).get('charlie')?.progress).toBeCloseTo(0.25);
    expect(replayPitStops(endless, shape)).toEqual([]);
  });

  it('runs a lap that is both an out-lap and an in-lap from the exit to the entry', () => {
    // Charlie stops again on lap 3, which ends at 478000: in the lane from 468000.
    const twice: ReplayRace = {
      ...pitted,
      laps: pitted.laps.map((lap) =>
        lap.lap === 3
          ? {
              ...lap,
              rows: lap.rows.map((row) =>
                row.driverId === 'charlie'
                  ? { ...row, inPit: true, pitDurationMs: 20_000, pitStop: 2 }
                  : row,
              ),
            }
          : lap,
      ),
    };
    const at = (ms: number) => carLapsAt(twice, ms, shape).get('charlie');
    expect(at(330_000)).toMatchObject({ lap: 3, inPit: false });
    expect(at(330_000)?.progress).toBeCloseTo(0.1);
    expect(at(399_000)?.progress).toBeCloseTo(0.5);
    expect(at(467_999)?.progress).toBeCloseTo(0.9, 3);
  });

  it('feeds the markers and the tower from the same window', () => {
    const marker = replayProgress(pitted, 315_000, shape).find((item) => item.id === 'charlie');
    expect(marker).toMatchObject({ inPit: true });
    expect(marker?.progress).toBeCloseTo(0.25);
    const rows = (ms: number) =>
      replayLiveRows(pitted, ms, { pit: shape }).find((row) => row.driverId === 'charlie');
    expect(rows(200_000)?.inPit).toBe(false);
    expect(rows(315_000)?.inPit).toBe(true);
    expect(rows(315_000)?.drs).toBe(false);
    expect(rows(330_000)?.inPit).toBe(false);
  });
});

describe('pit stops on the lane at the Monza red flag', () => {
  const file = generatedReplayFiles().find((name) => path.basename(name) === '2026-13.json');
  if (!file) {
    it.skip('is not generated yet, so the Monza check is skipped', () => {});
    return;
  }
  const monza = replayRaceSchema.parse(readJson(file));
  const circuit = circuitById('it-1922')!;
  const shape = { entry: circuit.pit.entry, exit: circuit.pit.exit };

  /** Where the Track Map draws a car, in metres from the line; on the lane by its progress. */
  const metres = (car: CarLap) => {
    const along = car.inPit
      ? shape.entry + car.progress * (1 - shape.entry + shape.exit)
      : car.progress;
    return (along % 1) * circuit.lengthM;
  };

  it.each([
    ['at constant speed', undefined],
    ['by the speed profile', circuit.profile],
  ] as const)('moves every car into the lane and out of it without a jump, %s', (_how, profile) => {
    // Every car stops on lap 3 for about 30 minutes and leaves the lane on lap 4.
    const from = leaderCumulative(monza, 2) - 5_000;
    const to = leaderCumulative(monza, 4) + 60_000;
    const last = new Map<string, number>();
    const pitted = new Set<string>();
    let worst = { jump: 0, at: 0, id: '' };
    for (let ms = from; ms <= to; ms += 100) {
      for (const [id, car] of carLapsAt(monza, ms, shape, profile)) {
        if (car.inPit) pitted.add(id);
        const here = metres(car);
        const was = last.get(id);
        last.set(id, here);
        if (was === undefined) continue;
        const step = Math.abs(here - was);
        const jump = Math.min(step, circuit.lengthM - step);
        if (jump > worst.jump) worst = { jump, at: ms, id };
      }
    }
    const stopped = monza.laps.find((lap) => lap.lap === 3)!.rows.filter((row) => row.inPit);
    expect([...pitted].sort()).toEqual(stopped.map((row) => row.driverId).sort());
    // 100 ms at 360 km/h is 10 m.
    expect(worst.jump, `${worst.id} at ${worst.at} ms`).toBeLessThan(15);
  });
});

describe('the speed profile through the position function at Monza', () => {
  const file = generatedReplayFiles().find((name) => path.basename(name) === '2026-13.json');
  if (!file) {
    it.skip('is not generated yet, so the Monza check is skipped', () => {});
    return;
  }
  const monza = replayRaceSchema.parse(readJson(file));
  const circuit = circuitById('it-1922')!;
  const { profile } = circuit;
  const shape = { entry: circuit.pit.entry, exit: circuit.pit.exit };
  const carAt = (id: string, ms: number) => carLapsAt(monza, ms, shape, profile).get(id);

  /** A driver's line crossing on `lap`, with the time the lap took. */
  const crossing = (id: string, lap: number) => {
    const row = monza.laps.find((item) => item.lap === lap)!.rows.find((r) => r.driverId === id)!;
    return { end: row.cumulativeMs!, time: row.lapTimeMs!, inPit: row.inPit };
  };
  const winner = monza.results.find((result) => result.position === 1)!.driverId;

  it('crosses the line at the real lap time', () => {
    for (let lap = 10; lap <= 20; lap++) {
      const { end, inPit } = crossing(winner, lap);
      if (inPit) continue;
      expect(carAt(winner, end - 1)).toMatchObject({ lap, inPit: false });
      expect(carAt(winner, end - 1)?.progress).toBeGreaterThan(0.999);
      expect(carAt(winner, end)).toMatchObject({ lap: lap + 1, progress: 0, distance: lap });
    }
  });

  it('is not halfway round halfway through its lap time', () => {
    const { end, time } = crossing(winner, 15);
    const half = carAt(winner, end - time / 2)!;
    expect(Math.abs(half.progress - 0.5)).toBeGreaterThan(0.01);
    expect(half.progress).toBeCloseTo(distanceAt(profile, WHOLE_LAP, 0.5), 6);
    // Without the profile the same moment is plain proportion.
    expect(carLapsAt(monza, end - time / 2, shape).get(winner)?.progress).toBeCloseTo(0.5, 6);
  });

  it('starts lap 1 from rest', () => {
    const one = crossing(winner, 1);
    const two = crossing(winner, 2);
    const early = (lap: { end: number; time: number }) =>
      carAt(winner, lap.end - lap.time + lap.time * 0.05)!.progress;
    expect(carAt(winner, 0)?.progress).toBe(0);
    expect(early(one)).toBeLessThan(early(two) / 2);
  });

  it('runs the pit lane at constant speed and the in-lap stretched to the entry', () => {
    const stop = replayPitStops(monza, shape).find((item) => item.lap !== 3)!;
    for (const share of [0.25, 0.5, 0.75]) {
      const car = carAt(stop.driverId, stop.atMs + share * stop.durationMs)!;
      expect(car.inPit).toBe(true);
      expect(car.progress).toBeCloseTo(share, 6);
    }
    const entering = carAt(stop.driverId, stop.atMs - 1)!;
    expect(entering.inPit).toBe(false);
    expect(entering.distance - (entering.lap - 1)).toBeCloseTo(shape.entry, 3);
  });

  it('leaves the gaps at the line as they were', () => {
    for (let lap = 10; lap <= 30; lap += 5) {
      const second = monza.laps
        .find((item) => item.lap === lap)!
        .rows.find((row) => row.position === 2)!;
      const at = second.cumulativeMs!;
      const gap = (options: Parameters<typeof replayLiveRows>[2]) =>
        replayLiveRows(monza, at, options).find((row) => row.driverId === second.driverId);
      const before = gap({ pit: shape })!;
      const after = gap({ pit: shape, profile })!;
      expect(after.gapToLeader).toBeCloseTo(before.gapToLeader!, 6);
      expect(after.interval).toBeCloseTo(before.interval!, 6);
    }
  });

  it('puts the tower and the Track Map in the same order, with no car behind a negative gap', () => {
    const end = leaderCumulative(monza, monza.totalLaps);
    for (let ms = 1_000; ms < end; ms += 7_000) {
      const rows = replayLiveRows(monza, ms, { pit: shape, profile });
      const cars = carLapsAt(monza, ms, shape, profile);
      const running = rows.filter((row) => cars.has(row.driverId));
      const distances = running.map((row) => cars.get(row.driverId)!.distance);
      expect(distances, `${ms} ms`).toEqual([...distances].sort((a, b) => b - a));
      for (const row of running) {
        if (row.interval !== null)
          expect(row.interval, `${row.driverId} at ${ms} ms`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('replayResultsRows', () => {
  it('orders the classification and puts the unclassified last', () => {
    const rows = replayResultsRows(race);
    expect(rows.map((row) => row.driverId)).toEqual(['bravo', 'alpha', 'charlie', 'delta']);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    expect(rows.at(-1)?.finishStatus).toBe('dnf');
  });

  it('takes the gap and the laps behind from the results', () => {
    const rows = replayResultsRows(race);
    expect(rows[0]?.gapToLeader).toBe(0);
    expect(rows[1]?.gapToLeader).toBe(2);
    expect(rows[2]?.gapToLeader).toBeNull();
    expect(rows[2]?.lapped).toBe(true);
    expect(rows[2]?.lapsBehind).toBe(1);
    expect(rows.map((row) => row.points)).toEqual([25, 18, 15, 0]);
  });

  it('gives every classified car its positions gained against the grid, and a retirement none', () => {
    const rows = replayResultsRows(race);
    expect(rows.map((row) => row.positionsGained)).toEqual([1, -1, 2, undefined]);
    expect(rows.some((row) => row.pitLaneStart)).toBe(false);
  });

  it('gives an unclassified car a position so the tower can sort it', () => {
    const unordered = {
      ...race,
      results: [race.results[3]!, race.results[2]!, race.results[0]!, race.results[1]!],
    };
    const rows = replayResultsRows(unordered);
    expect(rows.map((row) => row.driverId)).toEqual(['bravo', 'alpha', 'charlie', 'delta']);
    expect(rows[3]?.position).toBe(4);
  });
});

describe('replayPodium', () => {
  it('shows the winner a race time and the others their tower value', () => {
    const podium = replayPodium(race);
    expect(podium?.map((entry) => entry.driver.code)).toEqual(['BRA', 'ALP', 'CHA']);
    expect(podium?.[0]?.detail).toBe('0:04:57.000');
    expect(podium?.[1]?.detail).toBe('+2.000');
    expect(podium?.[2]?.detail).toBe('+1 LAP');
    expect(podium?.[0]?.team.color).toBe('#0000ff');
  });

  it('is null when fewer than three cars are classified', () => {
    const thin = { ...race, results: race.results.slice(0, 2) };
    expect(replayPodium(thin)).toBeNull();
  });
});

describe('formatRaceTime', () => {
  it('formats a race time with hours', () => {
    expect(formatRaceTime(5_663_754)).toBe('1:34:23.754');
    expect(formatRaceTime(0)).toBe('0:00:00.000');
  });
});

describe('leaderCumulative', () => {
  it('reads the leader time at each lap boundary', () => {
    expect(leaderCumulative(race, 0)).toBe(0);
    expect(leaderCumulative(race, 1)).toBe(100_000);
    expect(leaderCumulative(race, 2)).toBe(199_000);
    expect(leaderCumulative(race, 3)).toBe(297_000);
    expect(leaderCumulative(race, 9)).toBe(297_000);
  });
});

describe('carLapsAt', () => {
  it('puts each car on its own lap, not the leader lap', () => {
    // Bravo has just started lap three; alpha is still 500 ms from the end of lap two;
    // charlie and delta are a lap down and a quarter of the way through lap two.
    const cars = carLapsAt(race, 199_500);
    expect(cars.get('bravo')?.lap).toBe(3);
    expect(cars.get('bravo')?.progress).toBeCloseTo(500 / 98_000);
    expect(cars.get('alpha')?.lap).toBe(2);
    expect(cars.get('alpha')?.progress).toBeCloseTo(0.995);
    expect(cars.get('charlie')?.lap).toBe(2);
    expect(cars.get('charlie')?.progress).toBeCloseTo(39_500 / 160_000);
    expect(cars.get('delta')?.distance).toBeCloseTo(1 + 34_500 / 161_000);
  });

  it('drops a car once it has no lap in progress', () => {
    // Delta has no lap three: it is on the map until its own lap two ends at 326000.
    expect(carLapsAt(race, 325_999).has('delta')).toBe(true);
    expect(carLapsAt(race, 326_000).has('delta')).toBe(false);
    expect(carLapsAt(race, 326_000).get('charlie')?.lap).toBe(3);
    expect(carLapsAt(race, 10_000_000).size).toBe(0);
  });

  it('cannot time a lap that does not follow the car previous one', () => {
    const gappy = { ...race, laps: race.laps.filter((lap) => lap.lap !== 2) };
    expect(carLapsAt(gappy, 250_000).has('bravo')).toBe(false);
    expect(carLapsAt(gappy, 50_000).get('bravo')?.lap).toBe(1);
  });
});

describe('replayProgress', () => {
  it('interpolates within the lap and emphasises the leader', () => {
    const markers = replayProgress(race, 50_000);
    const alpha = markers.find((marker) => marker.id === 'alpha');
    expect(alpha?.progress).toBeCloseTo(0.5);
    expect(alpha?.emphasis).toBe(true);
    expect(alpha?.color).toBe('#ff0000');
    expect(alpha?.code).toBe('ALP');
    expect(markers.find((marker) => marker.id === 'bravo')?.emphasis).toBe(false);
  });

  it('measures the later laps from the driver own previous cumulative', () => {
    // Bravo starts lap two at 101000 and ends it at 199000, so half its lap is 150000.
    const markers = replayProgress(race, 150_000);
    expect(markers.find((marker) => marker.id === 'bravo')?.progress).toBeCloseTo(0.5);
  });

  it('does not send the field back to the line when the leader completes a lap', () => {
    // The leader (bravo) crosses at 199000; the others carry on where they were.
    const before = replayProgress(race, 198_900);
    const after = replayProgress(race, 199_100);
    const alphaBefore = before.find((marker) => marker.id === 'alpha')?.progress ?? 0;
    const alphaAfter = after.find((marker) => marker.id === 'alpha')?.progress ?? 0;
    expect(alphaAfter).toBeGreaterThan(alphaBefore);
    expect(alphaAfter).toBeGreaterThan(0.98);
    expect(after.find((marker) => marker.id === 'bravo')?.progress).toBeLessThan(0.01);
    expect(after.find((marker) => marker.id === 'bravo')?.emphasis).toBe(true);
    expect(after.find((marker) => marker.id === 'alpha')?.emphasis).toBe(false);
  });

  it('keeps the marker order of the drivers list', () => {
    expect(replayProgress(race, 199_000).map((marker) => marker.id)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);
  });

  it('skips a car whose cumulative time is unknown', () => {
    const broken = {
      ...race,
      laps: race.laps.map((lap) =>
        lap.lap === 1
          ? {
              ...lap,
              rows: lap.rows.map((row) =>
                row.driverId === 'delta' ? { ...row, cumulativeMs: null } : row,
              ),
            }
          : lap,
      ),
    };
    expect(replayProgress(broken, 10_000).map((marker) => marker.id)).not.toContain('delta');
    // Without a known end to lap one, lap two cannot be timed either.
    expect(replayProgress(broken, 200_000).map((marker) => marker.id)).not.toContain('delta');
  });
});

describe('replayProgress on the generated dataset', () => {
  const files = generatedReplayFiles();
  if (files.length === 0) {
    it.skip('is not generated yet, so the dataset checks are skipped', () => {});
    return;
  }

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s never sends a car backwards when the leader completes a lap',
    (_name, file) => {
      const real = replayRaceSchema.parse(readJson(file));
      for (let lap = 1; lap < real.totalLaps; lap++) {
        const boundary = leaderCumulative(real, lap);
        const before = new Map(
          replayProgress(real, boundary - 100).map((marker) => [marker.id, marker.progress]),
        );
        for (const marker of replayProgress(real, boundary + 100)) {
          const was = before.get(marker.id);
          if (was === undefined) continue;
          const wrapped = was > 0.9 && marker.progress < 0.1;
          expect(wrapped || marker.progress > was, `${marker.id} on lap ${lap}`).toBe(true);
        }
      }
    },
  );
});

describe('overtakeModeFor', () => {
  it('switches from DRS to the override in 2026', () => {
    expect(overtakeModeFor(2021)).toBe('drs');
    expect(overtakeModeFor(2025)).toBe('drs');
    expect(overtakeModeFor(2026)).toBe('overtake');
  });
});

describe('positionsGained', () => {
  const at = (driverId: string, position: number, finishStatus?: FinishStatus) =>
    positionsGained(race, { driverId, position, finishStatus });

  it('counts the grid slot against the position: a gain, a loss, or none', () => {
    // Charlie started fifth.
    expect(at('charlie', 3)).toEqual({ positionsGained: 2 });
    expect(at('charlie', 8)).toEqual({ positionsGained: -3 });
    expect(at('charlie', 5)).toEqual({ positionsGained: 0 });
    expect(at('charlie', 5, 'finished')).toEqual({ positionsGained: 0 });
  });

  it('counts a pit-lane start from the last slot, one per starter, and marks it', () => {
    // Delta's grid is zero; four cars started, so it counts from fourth.
    expect(at('delta', 2)).toEqual({ positionsGained: 2, pitLaneStart: true });
    expect(at('delta', 4)).toEqual({ positionsGained: 0, pitLaneStart: true });
  });

  it('leaves a car that did not start out of the starters', () => {
    const dns = {
      ...race,
      results: race.results.map((result) =>
        result.driverId === 'alpha' ? { ...result, finishStatus: 'dns' as const } : result,
      ),
    };
    expect(positionsGained(dns, { driverId: 'delta', position: 2 })).toEqual({
      positionsGained: 1,
      pitLaneStart: true,
    });
  });

  it('has nothing for an unknown grid slot, an unknown car, or a car out of the race', () => {
    const unknown = {
      ...race,
      results: race.results.map((result) =>
        result.driverId === 'charlie' ? { ...result, grid: null } : result,
      ),
    };
    expect(positionsGained(unknown, { driverId: 'charlie', position: 3 })).toEqual({});
    expect(at('nobody', 1)).toEqual({});
    expect(at('charlie', 3, 'dnf')).toEqual({});
    expect(at('delta', 4, 'dnf')).toEqual({});
  });
});

describe('emphasiseMarker', () => {
  const markers = replayProgress(race, 50_000);

  it('emphasises the named car and nobody else', () => {
    const emphasised = emphasiseMarker(markers, 'bravo');
    expect(emphasised.filter((marker) => marker.emphasis).map((marker) => marker.id)).toEqual([
      'bravo',
    ]);
    // The leader was the emphasised one before.
    expect(markers.find((marker) => marker.id === 'alpha')?.emphasis).toBe(true);
    expect(emphasised.find((marker) => marker.id === 'alpha')?.emphasis).toBe(false);
  });

  it('gives the compared cars the lesser emphasis, and never the followed one', () => {
    const emphasised = emphasiseMarker(markers, 'bravo', ['charlie', 'bravo']);
    expect(
      emphasised.filter((marker) => marker.secondaryEmphasis).map((marker) => marker.id),
    ).toEqual(['charlie']);
    expect(emphasiseMarker(markers, 'bravo').some((marker) => marker.secondaryEmphasis)).toBe(
      false,
    );
  });

  it('leaves the rest of each marker alone and emphasises nothing for an unknown id', () => {
    const emphasised = emphasiseMarker(markers, 'nobody');
    expect(emphasised.every((marker) => marker.emphasis === false)).toBe(true);
    expect(emphasised.map((marker) => marker.progress)).toEqual(
      markers.map((marker) => marker.progress),
    );
  });
});

describe('followedDriverId', () => {
  it('reads a driver code, in any case', () => {
    expect(followedDriverId(race, 'CHA')).toBe('charlie');
    expect(followedDriverId(race, 'cha')).toBe('charlie');
  });

  it('ignores an unknown code and no code at all', () => {
    expect(followedDriverId(race, 'ZZZ')).toBeUndefined();
    expect(followedDriverId(race, undefined)).toBeUndefined();
  });
});

describe('stintAt', () => {
  const stints = race.stints.find((car) => car.driverId === 'charlie')?.stints;

  it('finds the set of tyres the car is on at a lap', () => {
    expect(stintAt(stints, 1)).toEqual({ fromLap: 1, toLap: 2, compound: 'M' });
    expect(stintAt(stints, 2)?.compound).toBe('M');
    expect(stintAt(stints, 3)?.compound).toBe('S');
  });

  it('has nothing for a lap outside the stints, or a car without any', () => {
    expect(stintAt(stints, 4)).toBeUndefined();
    expect(stintAt(stints, 0)).toBeUndefined();
    expect(stintAt(undefined, 1)).toBeUndefined();
    expect(stintAt([], 1)).toBeUndefined();
  });
});

describe('leaderLapsCompleted', () => {
  it('counts only the laps the leader has finished', () => {
    expect(leaderLapsCompleted(race, 0)).toBe(0);
    expect(leaderLapsCompleted(race, 99_999)).toBe(0);
    expect(leaderLapsCompleted(race, 100_000)).toBe(1);
    expect(leaderLapsCompleted(race, 250_000)).toBe(2);
    expect(leaderLapsCompleted(race, 297_000)).toBe(3);
    expect(leaderLapsCompleted(race, 9_999_999)).toBe(3);
  });
});

describe('replayGaps', () => {
  const gaps = replayGaps(race);

  it('reads the gap to the leader in seconds, lap by lap', () => {
    expect(gaps.get('alpha')).toEqual([0, 1, 2]);
    expect(gaps.get('bravo')).toEqual([1, 0, 0]);
  });

  it('leaves a lap a car did not run with no time at all', () => {
    // Delta retired after lap two, so its last lap is a hole rather than a joined line.
    expect(gaps.get('delta')).toEqual([65, 127, null]);
  });

  it('keeps the dataset gap of a lapped car, which is where it belongs on the chart', () => {
    expect(gaps.get('charlie')).toEqual([60, 121, 181]);
  });
});

describe('sectorStatusesAt', () => {
  const statuses = (driverId: string, lap: number, at: number) =>
    sectorStatusesAt(race, driverId, lap, at).map((sector) => sector.status);
  const times = (driverId: string, lap: number, at: number) =>
    sectorStatusesAt(race, driverId, lap, at).map((sector) => sector.time);

  it('fills a lap in as the car runs it and never before', () => {
    // Alpha's opening lap is 30 / 35 / 35, so its sectors fall at 30s, 65s and 100s.
    expect(statuses('alpha', 1, 0)).toEqual(['unset', 'unset', 'unset']);
    expect(statuses('alpha', 1, 29_999)).toEqual(['unset', 'unset', 'unset']);
    expect(times('alpha', 1, 30_000)).toEqual([30, null, null]);
    expect(times('alpha', 1, 65_000)).toEqual([30, 35, null]);
    expect(times('alpha', 1, 100_000)).toEqual([30, 35, 35]);
  });

  it('never shows a lap the clock has not reached', () => {
    // Alpha starts its third lap at 200s, so nothing of it is readable at the line before.
    expect(statuses('alpha', 3, 200_000)).toEqual(['unset', 'unset', 'unset']);
  });

  it('calls the best of the race fastest and a car’s own best personal', () => {
    // Alpha sets the first sector one of the race at 30s; bravo is 0.3 slower on its own lap.
    expect(statuses('alpha', 1, 100_000)[0]).toBe('fastest');
    expect(statuses('bravo', 1, 101_000)[0]).toBe('personal');
    // Bravo goes quickest of all on lap two (29.4), so alpha's later 29.7 is only its own best.
    expect(statuses('bravo', 2, 199_000)[0]).toBe('fastest');
    expect(statuses('alpha', 3, 299_000)[0]).toBe('personal');
    // Charlie's opening sector one is its own first, so it is its best; its second lap is
    // slower than that, and slower than the race's.
    expect(statuses('charlie', 1, 160_000)[0]).toBe('personal');
    expect(statuses('charlie', 2, 320_000)[0]).toBe('slower');
  });

  it('counts only what is complete, so seeking backwards never keeps a later best', () => {
    // At 100s only alpha has a sector one time, so its 30.0 is the best of the race.
    expect(statuses('alpha', 1, 100_000)[0]).toBe('fastest');
    // Later, bravo's 29.4 has taken the race and alpha's own 29.7 has taken its own.
    expect(statuses('alpha', 1, 299_000)[0]).toBe('slower');
  });

  it('leaves a sector, a car or a lap with no timing unset', () => {
    // Charlie's second lap has no middle sector, and its last one is held back to the line.
    expect(statuses('charlie', 2, 319_999)).toEqual(['slower', 'unset', 'unset']);
    expect(times('charlie', 2, 320_000)).toEqual([52, null, 108]);
    // Delta's second lap has no timing at all, and neither has a car or lap outside the race.
    expect(statuses('delta', 2, 326_000)).toEqual(['unset', 'unset', 'unset']);
    expect(statuses('delta', 9, 999_999)).toEqual(['unset', 'unset', 'unset']);
    expect(statuses('nobody', 1, 999_999)).toEqual(['unset', 'unset', 'unset']);
  });
});

describe('sectorCardAt', () => {
  it('holds the finished lap until the car completes a sector of the next one', () => {
    // Alpha's opening lap is 30 / 35 / 35 and its second starts at 100s. Between the line and
    // the new sector one the card still shows lap 1, whole, with the time it added up to.
    const held = sectorCardAt(race, 'alpha', 2, 101_000);
    expect(held.lap).toBe(1);
    expect(held.sectors.map((sector) => sector.time)).toEqual([30, 35, 35]);
    expect(held.lapTime).toBe(100);
    // Alpha's opening lap is the only one finished at 101s, so it is the best of the race.
    expect(held.lapStatus).toBe('fastest');
  });

  it('judges the held lap against every lap finished so far', () => {
    // Bravo's lap two (98s) takes the race lap record from alpha's 100s opening lap.
    expect(sectorCardAt(race, 'bravo', 3, 199_500).lapStatus).toBe('fastest');
    // Alpha's own lap two (98.2s) is then its personal best, but not the race's.
    expect(sectorCardAt(race, 'alpha', 3, 199_500).lapStatus).toBe('personal');
  });

  it('follows the lap in progress from its first sector, with no lap time yet', () => {
    // 30s into lap two alpha has a sector one, so the card moves on to the lap being run.
    const running = sectorCardAt(race, 'alpha', 2, 131_000);
    expect(running.lap).toBe(2);
    expect(running.sectors[0]?.time).not.toBe(null);
    expect(running.sectors[1]?.time).toBe(null);
    // The lap is not over, so it has no time. This is what keeps the card one lap.
    expect(running.lapTime).toBe(null);
    // No time, so no claim: the lap figure reads as unset while the lap is being run.
    expect(running.lapStatus).toBe('unset');
  });

  it('has nothing to hold on the opening lap', () => {
    const first = sectorCardAt(race, 'alpha', 1, 0);
    expect(first.lap).toBe(1);
    expect(first.lapTime).toBe(null);
    expect(first.sectors.map((sector) => sector.status)).toEqual(['unset', 'unset', 'unset']);
  });

  it('gives no lap time to a held lap the source never timed in full', () => {
    // Charlie's second lap has no middle sector, so its three cannot add up to a lap time.
    const held = sectorCardAt(race, 'charlie', 3, 321_000);
    expect(held.lap).toBe(2);
    expect(held.lapTime).toBe(null);
    expect(held.lapStatus).toBe('unset');
  });
});

describe('speedTrapAt and speedTrapBestAt', () => {
  it('reads a car’s most recent reading, and nothing before its first', () => {
    expect(speedTrapAt(race, 'alpha', 99_999)).toBe(null);
    expect(speedTrapAt(race, 'alpha', 100_000)).toBe(240);
    expect(speedTrapAt(race, 'alpha', 298_999)).toBe(240);
    expect(speedTrapAt(race, 'alpha', 299_000)).toBe(241);
    expect(speedTrapAt(race, 'nobody', 999_999)).toBe(null);
  });

  it('holds a car’s last reading through a lap the source did not time', () => {
    // Delta's second lap carries no reading, so its first lap's stands.
    expect(speedTrapAt(race, 'delta', 326_000)).toBe(175);
  });

  it('names the best of the race so far, and nobody before the first reading', () => {
    expect(speedTrapBestAt(race, 99_999)).toBe(null);
    expect(speedTrapBestAt(race, 100_000)).toEqual({
      driverId: 'alpha',
      code: 'ALP',
      speedKph: 240,
    });
    expect(speedTrapBestAt(race, 199_000)).toEqual({
      driverId: 'bravo',
      code: 'BRA',
      speedKph: 242,
    });
  });

  it('never lets the best of the race fall as the clock advances', () => {
    let best = 0;
    for (let at = 0; at <= 500_000; at += 1000) {
      const now = speedTrapBestAt(race, at)?.speedKph ?? 0;
      expect(now).toBeGreaterThanOrEqual(best);
      best = now;
    }
  });
});

describe('trackStatusAt', () => {
  it('is green before the first message and while nothing is flying', () => {
    expect(trackStatusAt(race, 0)).toBe('green');
    // A local flag in one sector is not the flag over the track.
    expect(trackStatusAt(race, 35_000)).toBe('green');
  });

  it('flies the virtual safety car between its own two messages', () => {
    expect(trackStatusAt(race, 59_999)).toBe('green');
    expect(trackStatusAt(race, 60_000)).toBe('vsc');
    expect(trackStatusAt(race, 119_999)).toBe('vsc');
    expect(trackStatusAt(race, 120_000)).toBe('green');
  });

  it('reads a track-wide flag, and never a driver’s own', () => {
    // The black-and-white flag for one car at 210s changes nothing over the track.
    expect(trackStatusAt(race, 210_000)).toBe('green');
    expect(trackStatusAt(race, 250_000)).toBe('double-yellow');
    expect(trackStatusAt(race, 280_000)).toBe('green');
  });

  it('keeps the safety car above the flag under it, until its ending message', () => {
    const under = {
      ...race,
      raceControl: [
        message(10_000, { flag: 'YELLOW', scope: 'Track', message: 'YELLOW IN TRACK' }),
        message(20_000, { category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' }),
        message(30_000, { category: 'SafetyCar', message: 'SAFETY CAR IN THIS LAP' }),
        message(40_000, { flag: 'GREEN', scope: 'Track', message: 'GREEN LIGHT - TRACK CLEAR' }),
      ],
    };
    expect(trackStatusAt(under, 10_000)).toBe('yellow');
    expect(trackStatusAt(under, 25_000)).toBe('sc');
    // The car has come in, but the flags are still yellow until the green.
    expect(trackStatusAt(under, 35_000)).toBe('yellow');
    expect(trackStatusAt(under, 40_000)).toBe('green');
  });

  it('leaves a wording it does not know exactly as it was', () => {
    const unknown = {
      ...race,
      raceControl: [
        message(10_000, { flag: 'YELLOW', scope: 'Track', message: 'YELLOW IN TRACK' }),
        message(20_000, { category: 'SafetyCar', message: 'SAFETY CAR WILL USE STANDING START' }),
        message(30_000, { flag: 'BLUE', scope: 'Driver', message: 'BLUE FLAG FOR CAR 3 (CHA)' }),
        message(40_000, { category: 'Other', message: 'TRACK SURFACE SLIPPERY' }),
      ],
    };
    for (const at of [20_000, 30_000, 40_000]) expect(trackStatusAt(unknown, at)).toBe('yellow');
  });

  it('is green for the whole of a race with no messages at all', () => {
    const quiet = { ...race, raceControl: [] };
    expect(trackStatusAt(quiet, 0)).toBe('green');
    expect(trackStatusAt(quiet, 999_999)).toBe('green');
  });
});

describe('flaggedSectorsAt', () => {
  it('paints a flagged sector as its slice of the lap', () => {
    // The race's own messages mention sector 4 at most, so a sector is a quarter of the lap.
    expect(flaggedSectorsAt(race, 30_000)).toEqual([{ start: 0.25, end: 0.5, status: 'yellow' }]);
  });

  it('merges neighbouring zones of the same status into one arc', () => {
    expect(flaggedSectorsAt(race, 35_000)).toEqual([{ start: 0.25, end: 0.75, status: 'yellow' }]);
  });

  it('closes a zone on its own clear and every zone on a green', () => {
    expect(flaggedSectorsAt(race, 150_000)).toEqual([{ start: 0.5, end: 0.75, status: 'yellow' }]);
    expect(flaggedSectorsAt(race, 280_000)).toEqual([]);
  });

  it('has nothing flagged before the first message, as the same empty list every time', () => {
    expect(flaggedSectorsAt(race, 0)).toEqual([]);
    // Identity, not just emptiness: a consumer comparing props must not see a new array a tick.
    expect(flaggedSectorsAt(race, 0)).toBe(flaggedSectorsAt(race, 20_000));
  });

  it('joins a zone that straddles the start line into one', () => {
    const across = {
      ...race,
      raceControl: [
        message(10_000, {
          flag: 'YELLOW',
          scope: 'Sector',
          sector: 1,
          message: 'YELLOW IN TRACK SECTOR 1',
        }),
        message(20_000, {
          flag: 'YELLOW',
          scope: 'Sector',
          sector: 4,
          message: 'YELLOW IN TRACK SECTOR 4',
        }),
      ],
    };
    // Sector 4 runs into sector 1 over the line, which the map draws as one wrapping arc.
    expect(flaggedSectorsAt(across, 20_000)).toEqual([
      { start: 0.75, end: 0.25, status: 'yellow' },
    ]);
  });
});

describe('raceControlUpTo', () => {
  it('lists the messages up to now, newest first', () => {
    expect(raceControlUpTo(race, 0).map((entry) => entry.message)).toEqual([
      'GREEN LIGHT - PIT EXIT OPEN',
    ]);
    const atVsc = raceControlUpTo(race, 60_000);
    expect(atVsc).toHaveLength(5);
    expect(atVsc[0]?.message).toBe('VSC DEPLOYED');
    expect(atVsc.at(-1)?.message).toBe('GREEN LIGHT - PIT EXIT OPEN');
  });

  it('never reads a message from the future', () => {
    for (const at of [0, 45_000, 199_000, 297_000]) {
      expect(raceControlUpTo(race, at).every((entry) => entry.atMs <= at)).toBe(true);
    }
    expect(raceControlUpTo(race, 999_999)).toHaveLength(race.raceControl.length);
  });

  it('names the car a driver-scoped message is addressed to', () => {
    const latest = raceControlUpTo(race, 210_000)[0];
    expect(latest?.driverId).toBe('charlie');
    expect(latest?.scope).toBe('Driver');
  });

  it('has nothing for a race with no messages at all', () => {
    expect(raceControlUpTo({ ...race, raceControl: [] }, 999_999)).toEqual([]);
  });
});

describe('neutralisationPeriods', () => {
  /** What the bands draw: the kind, the ends on the clock and the laps they fall on. */
  const shape = (real: ReplayRace) =>
    neutralisationPeriods(real).map((period) => [period.status, period.fromLap, period.toLap]);

  it('reads the fixture’s virtual safety car off the same machine as the flag', () => {
    expect(neutralisationPeriods(race)).toEqual([
      { status: 'vsc', fromMs: 60_000, toMs: 120_000, fromLap: 1, toLap: 2 },
    ]);
    expect(trackStatusAt(race, 60_000)).toBe('vsc');
    expect(trackStatusAt(race, 120_000)).toBe('green');
  });

  it('is the same empty array for a race with no race control', () => {
    const quiet = { ...race, raceControl: [] };
    const first = neutralisationPeriods(quiet);
    expect(first).toEqual([]);
    // The identity holds across calls, so a memoised consumer is not woken by a fresh `[]`.
    expect(neutralisationPeriods(quiet)).toBe(first);
    expect(neutralisationPeriods({ ...race, raceControl: [] })).toBe(first);
  });

  it('builds the periods once per race object', () => {
    expect(neutralisationPeriods(race)).toBe(neutralisationPeriods(race));
  });

  it('leaves a local flag out: the race runs on under it', () => {
    const local = {
      ...race,
      raceControl: [
        message(10_000, { flag: 'YELLOW', scope: 'Sector', sector: 2, message: 'YELLOW IN 2' }),
        message(20_000, { flag: 'DOUBLE YELLOW', scope: 'Track', message: 'DOUBLE YELLOW' }),
        message(30_000, { flag: 'GREEN', scope: 'Track', message: 'GREEN' }),
      ],
    };
    expect(neutralisationPeriods(local)).toEqual([]);
  });

  it('ends a safety car that never ends at the red flag that stopped the race', () => {
    const stopped = {
      ...race,
      raceControl: [
        message(20_000, { category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' }),
        message(50_000, { flag: 'RED', scope: 'Track', message: 'RED FLAG' }),
        message(150_000, { flag: 'CLEAR', scope: 'Track', message: 'TRACK CLEAR' }),
      ],
    };
    expect(shape(stopped)).toEqual([
      ['sc', 1, 1],
      ['red', 1, 2],
    ]);
  });

  it('ends a period still open at the last message with the race', () => {
    const open = {
      ...race,
      raceControl: [message(250_000, { category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' })],
    };
    expect(neutralisationPeriods(open)).toEqual([
      { status: 'sc', fromMs: 250_000, toMs: 297_000, fromLap: 3, toLap: 3 },
    ]);
  });

  it('ends a period at the chequered flag', () => {
    const toTheFlag = {
      ...race,
      raceControl: [
        message(250_000, { category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' }),
        message(280_000, { flag: 'CHEQUERED', scope: 'Track', message: 'CHEQUERED FLAG' }),
      ],
    };
    expect(neutralisationPeriods(toTheFlag)).toEqual([
      { status: 'sc', fromMs: 250_000, toMs: 280_000, fromLap: 3, toLap: 3 },
    ]);
  });

  it('runs one period into the next when the kind changes with no green between', () => {
    const backToBack = {
      ...race,
      raceControl: [
        message(20_000, { category: 'SafetyCar', message: 'VSC DEPLOYED' }),
        message(40_000, { category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' }),
        message(80_000, { category: 'SafetyCar', message: 'SAFETY CAR IN THIS LAP' }),
      ],
    };
    expect(
      neutralisationPeriods(backToBack).map((period) => [period.status, period.fromMs]),
    ).toEqual([
      ['vsc', 20_000],
      ['sc', 40_000],
    ]);
    expect(neutralisationPeriods(backToBack)[1]?.toMs).toBe(80_000);
  });
});

describe('neutralisationSummary', () => {
  const period = (status: 'sc' | 'vsc' | 'red', fromLap: number, toLap: number) =>
    ({ status, fromMs: 0, toMs: 0, fromLap, toLap }) as const;

  it('has nothing to say about a race that was never neutralised', () => {
    expect(neutralisationSummary([])).toBeNull();
  });

  it('names the kind once when the race only ran one', () => {
    expect(
      neutralisationSummary([period('sc', 1, 7), period('sc', 33, 41), period('sc', 48, 53)]),
    ).toBe('Three safety car periods: laps 1 to 7, 33 to 41 and 48 to 53.');
    expect(neutralisationSummary([period('vsc', 14, 15)])).toBe(
      'One virtual safety car period: laps 14 to 15.',
    );
    expect(neutralisationSummary([period('vsc', 28, 28)])).toBe(
      'One virtual safety car period: lap 28.',
    );
  });

  it('names each kind when the race ran more than one', () => {
    expect(
      neutralisationSummary([period('vsc', 1, 2), period('sc', 3, 6), period('red', 32, 33)]),
    ).toBe(
      'Three neutralisation periods: virtual safety car laps 1 to 2, safety car laps 3 to 6 and red flag laps 32 to 33.',
    );
  });

  it('still counts them when the race carries no laps to place them on', () => {
    expect(
      neutralisationSummary([{ status: 'sc', fromMs: 0, toMs: 1, fromLap: null, toLap: null }]),
    ).toBe('One safety car period.');
  });
});

describe('race control on the generated dataset', () => {
  const files = generatedReplayFiles();
  if (files.length === 0) {
    it.skip('is not generated yet, so the dataset checks are skipped', () => {});
    return;
  }

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s reads the feed and the flags only up to the clock',
    (_name, file) => {
      const real = replayRaceSchema.parse(readJson(file));
      const end = leaderCumulative(real, real.totalLaps);
      for (const step of Array.from({ length: 21 }, (_, index) => Math.round((end * index) / 20))) {
        const feed = raceControlUpTo(real, step);
        expect(feed.every((entry) => entry.atMs <= step)).toBe(true);
        // Newest first, so every message is at or after the one under it.
        for (const [index, entry] of feed.entries()) {
          if (index > 0) expect(entry.atMs).toBeLessThanOrEqual(feed[index - 1]?.atMs ?? 0);
        }
        for (const sector of flaggedSectorsAt(real, step)) {
          expect(sector.start).toBeGreaterThanOrEqual(0);
          expect(sector.end).toBeLessThanOrEqual(1);
          expect(sector.status).not.toBe('green');
        }
      }
    },
  );

  it('flies the virtual safety car over the 2026 Spanish Grand Prix window', () => {
    const file = files.find((entry) => path.basename(entry) === '2026-14.json');
    if (file === undefined) return;
    const real = replayRaceSchema.parse(readJson(file));

    const deployed = real.raceControl.find((entry) => entry.message.includes('VSC DEPLOYED'));
    const ending = real.raceControl.find((entry) => entry.message.includes('VSC ENDING'));
    expect(deployed?.lap).toBe(14);
    expect(ending?.lap).toBe(15);
    if (!deployed || !ending) return;

    expect(trackStatusAt(real, deployed.atMs - 1)).not.toBe('vsc');
    expect(trackStatusAt(real, deployed.atMs)).toBe('vsc');
    expect(trackStatusAt(real, (deployed.atMs + ending.atMs) / 2)).toBe('vsc');
    expect(trackStatusAt(real, ending.atMs)).toBe('green');
  });

  /** What the curated set was measured to carry, race by race: the kinds, in race order. */
  const expectedKinds: Record<string, string[]> = {
    '2021-22.json': [],
    '2023-21.json': ['vsc', 'sc', 'sc'],
    '2024-21.json': ['vsc', 'sc', 'red', 'sc'],
    '2025-1.json': ['sc', 'sc', 'sc'],
    '2026-14.json': ['vsc'],
    '2026-15.json': ['sc', 'sc'],
  };

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s carries the neutralisation periods it was measured to have',
    (name, file) => {
      const real = replayRaceSchema.parse(readJson(file));
      const periods = neutralisationPeriods(real);
      const expected = expectedKinds[name];
      if (expected === undefined) return;
      expect(periods.map((period) => period.status)).toEqual(expected);

      const end = leaderCumulative(real, real.totalLaps);
      for (const [index, period] of periods.entries()) {
        expect(period.toMs).toBeGreaterThan(period.fromMs);
        expect(period.toMs).toBeLessThanOrEqual(end);
        // In race order, and never overlapping the one before it.
        if (index > 0) expect(period.fromMs).toBeGreaterThanOrEqual(periods[index - 1]?.toMs ?? 0);
        // The bands and the map read the same machine: the flag flying inside a period is it.
        expect(trackStatusAt(real, (period.fromMs + period.toMs) / 2)).toBe(period.status);
      }
    },
  );

  it('ends São Paulo 2024’s unclosed safety car at the red flag', () => {
    const file = files.find((entry) => path.basename(entry) === '2024-21.json');
    if (file === undefined) return;
    const real = replayRaceSchema.parse(readJson(file));
    const red = real.raceControl.find((entry) => entry.flag === 'RED');
    // The car is deployed and its ending message never comes: the race was stopped instead.
    const deployed = real.raceControl.filter((entry) => entry.message === 'SAFETY CAR DEPLOYED');
    const ended = real.raceControl.filter((entry) => entry.message.includes('SAFETY CAR IN THIS'));
    expect(deployed).toHaveLength(2);
    expect(ended).toHaveLength(1);

    const periods = neutralisationPeriods(real);
    expect(periods[1]?.status).toBe('sc');
    expect(periods[1]?.fromMs).toBe(deployed[0]?.atMs);
    expect(periods[1]?.toMs).toBe(red?.atMs);
    // The red flag that ended it is a period of its own, and the map agrees.
    expect(periods[2]?.status).toBe('red');
    expect(periods[2]?.fromMs).toBe(red?.atMs);
    expect(trackStatusAt(real, (red?.atMs ?? 0) + 1000)).toBe('red');
  });

  it('opens Australia 2025 neutralised, on the first lap', () => {
    const file = files.find((entry) => path.basename(entry) === '2025-1.json');
    if (file === undefined) return;
    const real = replayRaceSchema.parse(readJson(file));
    const first = neutralisationPeriods(real)[0];
    expect(first?.status).toBe('sc');
    expect(first?.fromLap).toBe(1);
    expect(first?.toLap).toBe(7);
    expect(neutralisationSummary(neutralisationPeriods(real))).toBe(
      'Three safety car periods: laps 1 to 7, 34 to 41 and 47 to 51.',
    );
  });

  it('tells the two kinds apart in Las Vegas 2023, which ran both', () => {
    const file = files.find((entry) => path.basename(entry) === '2023-21.json');
    if (file === undefined) return;
    const real = replayRaceSchema.parse(readJson(file));
    expect(neutralisationSummary(neutralisationPeriods(real))).toBe(
      'Three neutralisation periods: virtual safety car laps 1 to 2, safety car laps 3 to 6 and safety car laps 26 to 28.',
    );
  });

  it('has no race control at all for a race OpenF1 does not cover', () => {
    const file = files.find((entry) => path.basename(entry) === '2021-22.json');
    if (file === undefined) return;
    const real = replayRaceSchema.parse(readJson(file));
    expect(real.raceControl).toEqual([]);
    expect(real.source.raceControl).toBeUndefined();
    expect(trackStatusAt(real, Number.MAX_SAFE_INTEGER)).toBe('green');
    expect(flaggedSectorsAt(real, Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(raceControlUpTo(real, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });
});

describe('timing helpers on the generated dataset', () => {
  const files = generatedReplayFiles();
  if (files.length === 0) {
    it.skip('is not generated yet, so the dataset checks are skipped', () => {});
    return;
  }

  /** Twenty-five moments spread over the race, plus the very start. */
  const samples = (real: ReplayRace) => {
    const end = leaderCumulative(real, real.totalLaps);
    return Array.from({ length: 26 }, (_, step) => Math.round((end * step) / 25));
  };

  /** Every sector time the clock has revealed at `at`, and the best of them per sector. */
  const revealed = (real: ReplayRace, at: number) => {
    const best: (number | null)[] = [null, null, null];
    const fastest: number[][] = [[], [], []];
    for (const driver of real.drivers) {
      for (const lap of real.laps) {
        const sectors = sectorStatusesAt(real, driver.id, lap.lap, at);
        for (const [index, sector] of sectors.entries()) {
          if (sector.time === null) continue;
          const held = best[index] ?? null;
          if (held === null || sector.time < held) best[index] = sector.time;
          if (sector.status === 'fastest') fastest[index]?.push(sector.time);
        }
      }
    }
    return { best, fastest };
  };

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s keeps the bests honest as the clock advances',
    (name, file) => {
      const real = replayRaceSchema.parse(readJson(file));
      const held: (number | null)[] = [null, null, null];
      let bestSpeed = 0;

      for (const at of samples(real)) {
        const { best, fastest } = revealed(real, at);
        for (const [index, time] of best.entries()) {
          const previous = held[index] ?? null;
          // A sector best can appear, and can improve, but it can never get slower.
          if (time !== null && previous !== null) expect(time).toBeLessThanOrEqual(previous);
          if (time !== null) held[index] = time;
          // Only the best of the race so far may be flagged as the fastest of it.
          for (const flagged of fastest[index] ?? []) expect(flagged).toBe(time);
        }

        const speed = speedTrapBestAt(real, at)?.speedKph ?? 0;
        expect(speed, `${name} at ${at}`).toBeGreaterThanOrEqual(bestSpeed);
        bestSpeed = speed;
      }
    },
  );

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s never reads a lap the clock has not reached',
    (_name, file) => {
      const real = replayRaceSchema.parse(readJson(file));
      for (const at of samples(real)) {
        for (const [driverId, car] of carLapsAt(real, at)) {
          for (const lap of [car.lap + 1, car.lap + 2, real.totalLaps]) {
            if (lap <= car.lap) continue;
            expect(
              sectorStatusesAt(real, driverId, lap, at).every((sector) => sector.time === null),
              `${driverId} lap ${lap} at ${at}`,
            ).toBe(true);
          }
        }
      }
    },
  );

  it('has no timing at all for a season OpenF1 does not cover', () => {
    const file = files.find((entry) => path.basename(entry) === '2021-22.json');
    if (file === undefined) return;
    const real = replayRaceSchema.parse(readJson(file));
    expect(real.source.timing).toBeUndefined();
    expect(speedTrapBestAt(real, Number.MAX_SAFE_INTEGER)).toBe(null);
    for (const driver of real.drivers) {
      expect(speedTrapAt(real, driver.id, Number.MAX_SAFE_INTEGER)).toBe(null);
      expect(
        sectorStatusesAt(real, driver.id, 1, Number.MAX_SAFE_INTEGER).map((s) => s.status),
      ).toEqual(['unset', 'unset', 'unset']);
    }
  });

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s reads a car’s sectors where the source has them',
    (_name, file) => {
      const real = replayRaceSchema.parse(readJson(file));
      if (real.source.timing === undefined) return;
      const end = Number.MAX_SAFE_INTEGER;
      const read = real.drivers.flatMap((driver) =>
        real.laps.flatMap((lap) =>
          sectorStatusesAt(real, driver.id, lap.lap, end).filter((s) => s.time !== null),
        ),
      );
      expect(read.length).toBeGreaterThan(0);
      expect(speedTrapBestAt(real, end)?.speedKph).toBeGreaterThan(100);
    },
  );
});
