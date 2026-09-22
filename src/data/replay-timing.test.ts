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
  replayProgress,
  replayResultsRows,
  replayRowsForLap,
} from './replay-timing';

const race = testReplayRace();

describe('replayRowsForLap', () => {
  it('maps a lap onto tower rows in seconds', () => {
    const rows = replayRowsForLap(race, 1);
    expect(rows.map((row) => row.driverId)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);

    const leader = rows[0];
    expect(leader?.position).toBe(1);
    expect(leader?.gapToLeader).toBe(0);
    expect(leader?.interval).toBeNull();
    expect(leader?.lastLapTime).toBe(100);
    expect(leader?.bestLapTime).toBe(100);
    expect(leader?.positionChange).toBe(0);
    expect(leader?.lapped).toBe(false);
    expect(leader?.sectors).toEqual([
      { time: null, status: 'unset' },
      { time: null, status: 'unset' },
      { time: null, status: 'unset' },
    ]);
    expect(leader?.tyre).toEqual({ compound: 'M', age: 0 });
  });

  it('tracks the best lap so far and the change against the previous lap', () => {
    const rows = replayRowsForLap(race, 3, 2);
    const bravo = rows.find((row) => row.driverId === 'bravo');
    const alpha = rows.find((row) => row.driverId === 'alpha');

    expect(bravo?.bestLapTime).toBe(98);
    expect(bravo?.positionChange).toBe(0);
    // Alpha led lap one, so on lap two it lost a place and holds second on lap three.
    expect(
      replayRowsForLap(race, 2, 1).find((row) => row.driverId === 'alpha')?.positionChange,
    ).toBe(-1);
    expect(alpha?.bestLapTime).toBe(99);
  });

  it('carries the lapped flag and the overtake range', () => {
    const rows = replayRowsForLap(race, 2, 1);
    const charlie = rows.find((row) => row.driverId === 'charlie');
    expect(charlie?.lapped).toBe(true);
    expect(charlie?.lapsBehind).toBe(1);
    expect(rows.find((row) => row.driverId === 'alpha')?.drs).toBe(true);
  });

  it('omits a driver that is no longer in the lap', () => {
    expect(replayRowsForLap(race, 3, 2).map((row) => row.driverId)).not.toContain('delta');
  });

  it('returns nothing for a lap the race does not have', () => {
    expect(replayRowsForLap(race, 99)).toEqual([]);
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
