import { describe, expect, it } from 'vitest';
import {
  MAX_GRADE,
  averageRound,
  elevationAt,
  limitGrade,
  medianRound,
  smoothLapElevation,
} from './elevation';

/** The biggest step between neighbours round a closed array, the wrap included. */
const steepestStep = (values: readonly number[]) =>
  Math.max(...values.map((value, index) => Math.abs(values[(index + 1) % values.length]! - value)));

/** One hill round a lap of `n` heights `rise` high, with a tree-like spike on it. */
const hillLap = (n: number, rise: number) =>
  Array.from({ length: n }, (_, index) => {
    const hill = (rise / 2) * (1 - Math.cos((2 * Math.PI * index) / n));
    return 300 + hill + (index === Math.round(n / 3) ? 25 : 0);
  });

describe('medianRound', () => {
  it('drops a one-sample spike and keeps a steady climb', () => {
    expect(medianRound([0, 0, 9, 0, 0], 1)).toEqual([0, 0, 0, 0, 0]);
    expect(medianRound([1, 2, 3, 4, 5, 6], 1).slice(1, -1)).toEqual([2, 3, 4, 5]);
  });
});

describe('averageRound', () => {
  it('keeps a flat lap flat and wraps round the lap', () => {
    expect(averageRound([4, 4, 4, 4], 2)).toEqual([4, 4, 4, 4]);
    expect(averageRound([3, 0, 0, 0, 0, 0], 1)[5]).toBeCloseTo(1);
  });
});

describe('limitGrade', () => {
  it('keeps every step, the wrap included, within the gradient', () => {
    const step = 20;
    const values = [0, 0, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0];
    const limited = limitGrade(values, step, MAX_GRADE);
    expect(steepestStep(limited)).toBeLessThanOrEqual(MAX_GRADE * step + 1e-9);
  });

  it('leaves heights alone that already keep to it', () => {
    const gentle = [0, 1, 2, 2, 1, 0];
    expect(limitGrade(gentle, 20, MAX_GRADE)).toEqual(gentle);
  });

  it('closes a lap that ends far from where it started', () => {
    const ramp = Array.from({ length: 50 }, (_, index) => index * 2);
    const limited = limitGrade(ramp, 20, MAX_GRADE);
    expect(Math.abs(limited.at(-1)! - limited[0]!)).toBeLessThanOrEqual(MAX_GRADE * 20 + 1e-9);
  });
});

describe('smoothLapElevation', () => {
  const step = 20;
  const heights = smoothLapElevation(hillLap(350, 60), step);

  it('measures from the lowest point, in tenths of a metre', () => {
    expect(Math.min(...heights)).toBe(0);
    for (const value of heights) expect(Math.round(value * 10) / 10).toBe(value);
  });

  it('keeps the hill and loses the spike', () => {
    expect(Math.max(...heights)).toBeGreaterThan(55);
    expect(Math.max(...heights)).toBeLessThan(61);
    const third = Math.round(350 / 3);
    const expected = 30 * (1 - Math.cos((2 * Math.PI * third) / 350));
    expect(Math.abs(heights[third]! - expected)).toBeLessThan(2);
  });

  it('never steps more than the gradient allows, round the closed lap', () => {
    expect(steepestStep(heights)).toBeLessThanOrEqual(MAX_GRADE * step + 0.1 + 1e-9);
  });

  it('gives nothing for nothing', () => {
    expect(smoothLapElevation([], step)).toEqual([]);
  });
});

describe('elevationAt', () => {
  const heights = [0, 10, 20, 10];

  it('reads the heights evenly round the lap, linear between them', () => {
    expect(elevationAt(heights, 0)).toBe(0);
    expect(elevationAt(heights, 0.25)).toBe(10);
    expect(elevationAt(heights, 0.375)).toBe(15);
  });

  it('wraps past the line either way', () => {
    expect(elevationAt(heights, 0.875)).toBe(5);
    expect(elevationAt(heights, 1.25)).toBe(10);
    expect(elevationAt(heights, -0.25)).toBe(10);
  });

  it('is flat without heights', () => {
    expect(elevationAt([], 0.4)).toBe(0);
  });
});
