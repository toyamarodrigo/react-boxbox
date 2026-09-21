import { describe, expect, it } from 'vitest';
import { testReplayRace } from './replay-fixtures';
import {
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

describe('replayProgress', () => {
  it('interpolates within the lap and emphasises the leader', () => {
    const markers = replayProgress(race, 1, 50_000);
    const alpha = markers.find((marker) => marker.id === 'alpha');
    expect(alpha?.progress).toBeCloseTo(0.5);
    expect(alpha?.emphasis).toBe(true);
    expect(alpha?.color).toBe('#ff0000');
    expect(alpha?.code).toBe('ALP');
    expect(markers.find((marker) => marker.id === 'bravo')?.emphasis).toBe(false);
  });

  it('measures the later laps from the driver own previous cumulative', () => {
    // Bravo starts lap two at 101000 and takes 98000, so half its lap is 150000.
    const markers = replayProgress(race, 2, 150_000);
    expect(markers.find((marker) => marker.id === 'bravo')?.progress).toBeCloseTo(0.5);
  });

  it('clamps outside the lap rather than running off the track', () => {
    const early = replayProgress(race, 2, 0);
    expect(early.every((marker) => marker.progress === 0)).toBe(true);
    const late = replayProgress(race, 2, 10_000_000);
    expect(late.every((marker) => marker.progress === 1)).toBe(true);
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
    expect(replayProgress(broken, 1, 10_000).map((marker) => marker.id)).not.toContain('delta');
  });
});

describe('overtakeModeFor', () => {
  it('switches from DRS to the override in 2026', () => {
    expect(overtakeModeFor(2021)).toBe('drs');
    expect(overtakeModeFor(2025)).toBe('drs');
    expect(overtakeModeFor(2026)).toBe('overtake');
  });
});
