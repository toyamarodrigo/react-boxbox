import { describe, expect, it } from 'vitest';
import { testReplayRace } from './replay-fixtures';
import type { ReplayRace } from './replay-schema';
import { carLapsAt, replayLiveRows, replayProgress } from './replay-timing';
import {
  CONSTANT_SPEED,
  type LapStretch,
  type SpeedProfile,
  WHOLE_LAP,
  distanceAt,
  isConstantSpeed,
  timeShareAt,
} from './speed-profile';

/** Slow out of the line, a quick middle, slow again into it: never constant, always increasing. */
const curvy: SpeedProfile = { time: [0, 0.2, 0.3, 0.35, 0.45, 0.7, 1] };

const IN_LAP: LapStretch = { from: 0, to: 0.9 };
const OUT_LAP: LapStretch = { from: 0.1, to: 1 };
const STRETCHES = [WHOLE_LAP, IN_LAP, OUT_LAP];

const SHARES = Array.from({ length: 41 }, (_, i) => i / 40);

describe('the constant profile', () => {
  it('is constant speed, and a shaped profile is not', () => {
    expect(isConstantSpeed(CONSTANT_SPEED)).toBe(true);
    expect(isConstantSpeed(curvy)).toBe(false);
  });

  it('is the identity over the whole lap', () => {
    for (const share of SHARES) {
      expect(distanceAt(CONSTANT_SPEED, WHOLE_LAP, share)).toBe(share);
      expect(timeShareAt(CONSTANT_SPEED, WHOLE_LAP, share)).toBe(share);
    }
  });

  it('is plain proportion over a stretch', () => {
    for (const share of SHARES) {
      expect(distanceAt(CONSTANT_SPEED, OUT_LAP, share)).toBeCloseTo(0.1 + 0.9 * share, 12);
      expect(distanceAt(CONSTANT_SPEED, IN_LAP, share)).toBeCloseTo(0.9 * share, 12);
    }
  });
});

describe('a shaped profile', () => {
  it('reads its own time at each of its points', () => {
    curvy.time.forEach((time, i) => {
      expect(timeShareAt(curvy, WHOLE_LAP, i / (curvy.time.length - 1))).toBeCloseTo(time, 12);
    });
  });

  it('starts and ends each stretch at its two ends', () => {
    for (const stretch of STRETCHES) {
      expect(distanceAt(curvy, stretch, 0)).toBeCloseTo(stretch.from, 12);
      expect(distanceAt(curvy, stretch, 1)).toBeCloseTo(stretch.to, 12);
    }
  });

  it('never runs backwards', () => {
    for (const stretch of STRETCHES) {
      const distances = SHARES.map((share) => distanceAt(curvy, stretch, share));
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]!).toBeGreaterThan(distances[i - 1]!);
      }
    }
  });

  it('is not halfway round at half the lap time', () => {
    // Half the time is spent by 0.7 of the distance: the quick middle makes up for the slow start.
    expect(distanceAt(curvy, WHOLE_LAP, 0.5)).toBeCloseTo(0.7, 12);
  });

  it('round-trips distance and time over every stretch', () => {
    for (const stretch of STRETCHES) {
      for (const share of SHARES) {
        expect(timeShareAt(curvy, stretch, distanceAt(curvy, stretch, share))).toBeCloseTo(
          share,
          12,
        );
        const distance = stretch.from + (stretch.to - stretch.from) * share;
        expect(distanceAt(curvy, stretch, timeShareAt(curvy, stretch, distance))).toBeCloseTo(
          distance,
          12,
        );
      }
    }
  });
});

describe('positions with a speed profile', () => {
  const race = testReplayRace();
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
  const shape = { entry: 0.9, exit: 0.1 };
  const moments = Array.from({ length: 80 }, (_, i) => i * 5_000 + 1_234);

  it('gives exactly the positions of no profile with the constant one', () => {
    for (const ms of moments) {
      expect(carLapsAt(pitted, ms, shape, CONSTANT_SPEED)).toEqual(carLapsAt(pitted, ms, shape));
      expect(carLapsAt(pitted, ms, undefined, CONSTANT_SPEED)).toEqual(carLapsAt(pitted, ms));
      expect(replayProgress(pitted, ms, shape, CONSTANT_SPEED)).toEqual(
        replayProgress(pitted, ms, shape),
      );
      expect(
        replayLiveRows(pitted, ms, { pit: shape, gapAtMs: ms - 1_000, profile: CONSTANT_SPEED }),
      ).toEqual(replayLiveRows(pitted, ms, { pit: shape, gapAtMs: ms - 1_000 }));
    }
  });

  it('moves a car by the profile between line crossings', () => {
    // Bravo's lap two runs from 101000 to 199000: halfway through its time it is not halfway round.
    const halfway = (101_000 + 199_000) / 2;
    expect(carLapsAt(race, halfway).get('bravo')?.progress).toBeCloseTo(0.5, 12);
    expect(carLapsAt(race, halfway, undefined, curvy).get('bravo')?.progress).toBeCloseTo(
      distanceAt(curvy, WHOLE_LAP, 0.5),
      12,
    );
  });

  it('keeps the pit lane at constant speed and the stretched in-lap reaching the entry', () => {
    const charlie = (ms: number, profile?: SpeedProfile) =>
      carLapsAt(pitted, ms, shape, profile).get('charlie');
    expect(charlie(309_999, curvy)?.progress).toBeCloseTo(0.9, 3);
    expect(charlie(315_000, curvy)).toEqual(charlie(315_000));
    expect(charlie(325_000, curvy)).toEqual(charlie(325_000));
  });
});
