import { describe, expect, it } from 'vitest';
import {
  MAX_COMPARED,
  type CompareLine,
  compareChartDomain,
  compareChartLabel,
  compareChartRows,
  compareDifferences,
  compareStats,
  compareVisible,
  comparedDriverIds,
  comparedSearch,
  dashedDrivers,
  formatDifference,
  toggleCompared,
} from './replay-compare';
import { testReplayRace } from './replay-fixtures';
import type { ReplayRace } from './replay-schema';

const race = testReplayRace();

/** The test race with one more car, so four can be named after the followed one. */
const fiveCars = (): ReplayRace => ({
  ...race,
  drivers: [
    ...race.drivers,
    { id: 'echo', code: 'ECH', number: 5, firstName: 'Ed', lastName: 'Echo', teamId: 'red' },
  ],
});

/** The test race with a stop on the given car's lap: that lap is its in-lap, the next its out-lap. */
function withStop(driverId: string, lap: number): ReplayRace {
  return {
    ...race,
    laps: race.laps.map((entry) => ({
      ...entry,
      rows: entry.rows.map((row) =>
        row.driverId === driverId && entry.lap === lap
          ? { ...row, inPit: true, pitStop: 1, pitDurationMs: 22_000 }
          : row,
      ),
    })),
  };
}

describe('comparedDriverIds', () => {
  it('reads codes in any case, in the order given', () => {
    expect(comparedDriverIds(race, 'cha,BRA', 'alpha')).toEqual(['charlie', 'bravo']);
    expect(comparedDriverIds(race, ' del , bra ', 'alpha')).toEqual(['delta', 'bravo']);
  });

  it('drops unknown codes, repeats, empty parts and the followed driver', () => {
    expect(comparedDriverIds(race, 'XYZ,CHA,,cha,ALP,BRA', 'alpha')).toEqual(['charlie', 'bravo']);
    expect(comparedDriverIds(race, 'ALP', 'alpha')).toEqual([]);
    expect(comparedDriverIds(race, '', 'alpha')).toEqual([]);
  });

  it('keeps the first three', () => {
    expect(comparedDriverIds(fiveCars(), 'BRA,CHA,DEL,ECH', 'alpha')).toEqual([
      'bravo',
      'charlie',
      'delta',
    ]);
    // The followed driver does not take a place.
    expect(comparedDriverIds(fiveCars(), 'ALP,BRA,CHA,DEL,ECH', 'alpha')).toHaveLength(
      MAX_COMPARED,
    );
  });

  it('is empty without a followed driver or a search', () => {
    expect(comparedDriverIds(race, 'BRA,CHA', undefined)).toEqual([]);
    expect(comparedDriverIds(race, undefined, 'alpha')).toEqual([]);
  });
});

describe('comparedSearch and toggleCompared', () => {
  it('writes the codes comma-separated, and nothing for nobody', () => {
    expect(comparedSearch(race, ['charlie', 'bravo'])).toBe('CHA,BRA');
    expect(comparedSearch(race, [])).toBeUndefined();
    expect(comparedSearch(race, ['nobody'])).toBeUndefined();
  });

  it('adds, removes, and refuses a fourth', () => {
    expect(toggleCompared([], 'bravo')).toEqual(['bravo']);
    expect(toggleCompared(['bravo', 'charlie'], 'bravo')).toEqual(['charlie']);
    expect(toggleCompared(['bravo', 'charlie', 'delta'], 'echo')).toEqual([
      'bravo',
      'charlie',
      'delta',
    ]);
  });
});

describe('dashedDrivers', () => {
  it('dashes the second car of a team, followed driver first', () => {
    // Alpha and charlie are the red team, bravo and delta the blue.
    expect([...dashedDrivers(race, ['alpha', 'bravo', 'charlie'])]).toEqual(['charlie']);
    expect([...dashedDrivers(race, ['charlie', 'alpha', 'delta', 'bravo'])]).toEqual([
      'alpha',
      'bravo',
    ]);
    expect(dashedDrivers(race, ['alpha', 'bravo']).size).toBe(0);
  });
});

describe('compareDifferences', () => {
  it('puts the followed driver on zero and measures the rest at the line', () => {
    expect(compareDifferences(race, 'alpha', 'alpha').map((point) => point.seconds)).toEqual([
      0, 0, 0,
    ]);
    expect(compareDifferences(race, 'alpha', 'bravo')).toEqual([
      { lap: 1, seconds: 1, at: 101_000 },
      { lap: 2, seconds: -1, at: 200_000 },
      { lap: 3, seconds: -2, at: 299_000 },
    ]);
  });

  it('counts a lapped car on its own laps, so it is a lap behind rather than level', () => {
    // Charlie is on its second lap while alpha finishes its third: lap for lap, not side by side.
    expect(compareDifferences(race, 'alpha', 'charlie')).toEqual([
      { lap: 1, seconds: 60, at: 160_000 },
      { lap: 2, seconds: 120, at: 320_000 },
      { lap: 3, seconds: 179, at: 478_000 },
    ]);
  });

  it('stops a retired car’s line, and every line when the followed car retired', () => {
    expect(compareDifferences(race, 'alpha', 'delta').map((point) => point.lap)).toEqual([1, 2]);
    expect(compareDifferences(race, 'delta', 'bravo')).toEqual([
      { lap: 1, seconds: -64, at: 165_000 },
      { lap: 2, seconds: -127, at: 326_000 },
    ]);
  });

  it('has nothing for a car it does not know', () => {
    expect(compareDifferences(race, 'alpha', 'nobody')).toEqual([]);
    expect(compareDifferences(race, 'nobody', 'alpha')).toEqual([]);
  });

  it('shows a point once both cars have crossed the line', () => {
    const points = compareDifferences(race, 'alpha', 'bravo');
    expect(compareVisible(points, 100_999)).toBe(0);
    expect(compareVisible(points, 101_000)).toBe(1);
    // Bravo finished lap 2 at 199 s, but alpha only at 200 s.
    expect(compareVisible(points, 199_500)).toBe(1);
    expect(compareVisible(points, Number.POSITIVE_INFINITY)).toBe(3);
  });
});

describe('compareStats', () => {
  it('takes the best of every lap and the mean of the clean ones', () => {
    // Laps 1 and 2 ran under the virtual safety car, so only charlie's second and third count.
    expect(compareStats(race, 'charlie', Number.POSITIVE_INFINITY)).toEqual({
      bestLapMs: 158_000,
      bestLap: 3,
      cleanPaceMs: 159_000,
      cleanLaps: 2,
      stops: 0,
    });
    expect(compareStats(race, 'alpha', Number.POSITIVE_INFINITY)).toMatchObject({
      bestLapMs: 99_000,
      cleanPaceMs: 99_000,
      cleanLaps: 1,
    });
  });

  it('reads only the laps completed by the race time', () => {
    expect(compareStats(race, 'charlie', 200_000)).toEqual({
      bestLapMs: 160_000,
      bestLap: 1,
      cleanPaceMs: null,
      cleanLaps: 0,
      stops: 0,
    });
    expect(compareStats(race, 'charlie', 0).bestLapMs).toBeNull();
  });

  it('counts a stop and leaves its in- and out-laps out of the pace', () => {
    const stopped = withStop('charlie', 2);
    expect(compareStats(stopped, 'charlie', 319_999).stops).toBe(0);
    expect(compareStats(stopped, 'charlie', Number.POSITIVE_INFINITY)).toEqual({
      bestLapMs: 158_000,
      bestLap: 3,
      cleanPaceMs: null,
      cleanLaps: 0,
      stops: 1,
    });
  });

  it('keeps a retired car’s figures from the laps it ran', () => {
    expect(compareStats(race, 'delta', Number.POSITIVE_INFINITY)).toMatchObject({
      bestLapMs: 161_000,
      bestLap: 2,
      cleanLaps: 1,
    });
  });
});

describe('formatDifference', () => {
  it('signs both ways to a tenth', () => {
    expect(formatDifference(1.24)).toBe('+1.2');
    expect(formatDifference(-0.76)).toBe('−0.8');
    expect(formatDifference(0.04)).toBe('0.0');
    expect(formatDifference(-0.04)).toBe('0.0');
  });
});

describe('Compare chart helpers', () => {
  const line = (id: string, code: string, points: CompareLine['points']): CompareLine => ({
    id,
    code,
    dashed: false,
    points,
  });
  const followed = line('alpha', 'ALP', compareDifferences(race, 'alpha', 'alpha'));
  const bravo = line('bravo', 'BRA', compareDifferences(race, 'alpha', 'bravo'));
  const delta = line('delta', 'DEL', compareDifferences(race, 'alpha', 'delta'));

  it('builds a row per lap, with a hole where a car has no lap', () => {
    expect(compareChartRows([followed, delta])).toEqual([
      { lap: 1, alpha: 0, delta: 65 },
      { lap: 2, alpha: 0, delta: 126 },
      { lap: 3, alpha: 0, delta: null },
    ]);
    expect(compareChartRows([line('alpha', 'ALP', [])])).toEqual([]);
  });

  it('holds zero in the range and is at least a second tall', () => {
    expect(compareChartDomain([followed, bravo])).toEqual([-2, 1]);
    expect(compareChartDomain([followed, delta])).toEqual([0, 126]);
    expect(compareChartDomain([followed])).toEqual([0, 1]);
  });

  it('says where each compared car stands at its last lap shown', () => {
    expect(compareChartLabel([followed, bravo, delta], 3)).toBe(
      'Time difference to ALP over all 3 laps. BRA 2.0 seconds ahead at lap 3. DEL 126.0 seconds behind at lap 2.',
    );
    expect(
      compareChartLabel([{ ...followed, points: followed.points.slice(0, 1) }, bravo], 3),
    ).toMatch(/^Time difference to ALP over 1 of 3 laps\./);
    expect(compareChartLabel([{ ...followed, points: [] }], 3)).toBe(
      'Time difference to ALP. No laps completed of 3.',
    );
  });
});
