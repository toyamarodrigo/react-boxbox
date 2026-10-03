import { describe, expect, it } from 'vitest';
import { outlinePoints, polylineLength } from './svg-outline';

describe('outlinePoints', () => {
  it('reads straight outlines and drops a last point that repeats the first', () => {
    expect(outlinePoints('M 0 0 L 3 0 L 3 4 L 0 0 Z')).toEqual([
      [0, 0],
      [3, 0],
      [3, 4],
    ]);
    expect(polylineLength(outlinePoints('M 0 0 L 3 0 L 3 4 Z'), true)).toBe(12);
  });

  it('samples cubic curves, ending on their end point', () => {
    const points = outlinePoints('M 0 0 C 0 10 10 10 10 0');
    expect(points.length).toBeGreaterThan(8);
    expect(points.at(-1)).toEqual([10, 0]);
    // Longer than the chord, shorter than the control polygon.
    const length = polylineLength(points, false);
    expect(length).toBeGreaterThan(10);
    expect(length).toBeLessThan(30);
  });
});
