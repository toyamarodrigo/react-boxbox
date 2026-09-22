import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatedReplayFiles, readJson, testReplayRace } from './replay-fixtures';
import { type ReplayRace, replayRaceSchema } from './replay-schema';
import {
  carLapsAt,
  emphasiseMarker,
  followedDriverId,
  formatRaceTime,
  leaderCumulative,
  leaderLapsCompleted,
  overtakeModeFor,
  positionsSinceStart,
  replayGaps,
  replayLiveRows,
  replayPitStops,
  replayPodium,
  replayProgress,
  replayResultsRows,
  sectorStatusesAt,
  speedTrapAt,
  speedTrapBestAt,
  stintAt,
} from './replay-timing';

const race = testReplayRace();

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

describe('positionsSinceStart', () => {
  it('counts the grid slot against the position now', () => {
    // Charlie started fifth.
    expect(positionsSinceStart(race, 'charlie', 3)).toBe(2);
    expect(positionsSinceStart(race, 'charlie', 8)).toBe(-3);
    expect(positionsSinceStart(race, 'charlie', 5)).toBe(0);
  });

  it('has nothing to count from for a pit-lane start or an unknown car', () => {
    // Delta's grid is zero: it started from the pit lane, which is not a grid slot.
    expect(positionsSinceStart(race, 'delta', 4)).toBeNull();
    expect(positionsSinceStart(race, 'nobody', 1)).toBeNull();
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
