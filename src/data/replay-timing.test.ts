import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatedReplayFiles, readJson, testReplayRace } from './replay-fixtures';
import { replayRaceSchema } from './replay-schema';
import {
  carLapsAt,
  formatRaceTime,
  leaderCumulative,
  overtakeModeFor,
  replayPodium,
  replayLiveRows,
  replayProgress,
  replayResultsRows,
} from './replay-timing';

const race = testReplayRace();

describe('replayLiveRows', () => {
  it('lists the grid in drivers order at the start, with placeholders for what the data lacks', () => {
    const rows = replayLiveRows(race, 0);
    expect(rows.map((row) => row.driverId)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4]);

    const leader = rows[0];
    expect(leader?.gapToLeader).toBe(0);
    expect(leader?.interval).toBeNull();
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
