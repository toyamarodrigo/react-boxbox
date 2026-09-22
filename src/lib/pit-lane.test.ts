import { describe, expect, it } from 'vitest';
import { type Point, pitLanePoints, signedArea } from './pit-lane';

/** A 100-unit square, start/finish at the origin, running anticlockwise in y-up axes. */
const SQUARE: Point[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
const options = { entry: 0.9, exit: 0.1, offset: 10 };

/** Distance from a point to the nearest edge of the square. */
const edgeDistance = ([x, y]: Point) => Math.min(x, y, 100 - x, 100 - y);

describe('signedArea', () => {
  it('is positive anticlockwise and negative clockwise', () => {
    expect(signedArea(SQUARE)).toBe(10_000);
    expect(signedArea([...SQUARE].reverse())).toBe(-10_000);
  });
});

describe('pitLanePoints', () => {
  it('runs from entry to exit around the line, inside the loop, and rejoins at both ends', () => {
    const lane = pitLanePoints(SQUARE, options);
    const first = lane[0]!;
    const last = lane.at(-1)!;
    // 0.9 of the lap is 40 units up the last edge; 0.1 is 40 units along the first.
    expect(first[0]).toBeCloseTo(0);
    expect(first[1]).toBeCloseTo(40);
    expect(last[0]).toBeCloseTo(40);
    expect(last[1]).toBeCloseTo(0);
    // Every point is inside the square; past the taper the lane sits `offset` off the track.
    expect(lane.every((point) => edgeDistance(point) >= -1e-9)).toBe(true);
    const quarter = lane[Math.floor(lane.length / 4)]!;
    expect(edgeDistance(quarter)).toBeCloseTo(10);
    // The corner at the line is rounded off the track too, not pulled back onto it.
    const middle = lane[Math.floor(lane.length / 2)]!;
    expect(Math.hypot(middle[0], middle[1])).toBeCloseTo(10);
  });

  it('puts the lane on the same side whichever way the outline is wound', () => {
    const clockwise = pitLanePoints([...SQUARE].reverse(), { ...options, entry: 0.9, exit: 0.1 });
    expect(clockwise.every((point) => edgeDistance(point) >= -1e-9)).toBe(true);
  });

  it('can be sent outside', () => {
    const outside = pitLanePoints(SQUARE, { ...options, side: 'outside' });
    const quarter = outside[Math.floor(outside.length / 4)]!;
    expect(edgeDistance(quarter)).toBeCloseTo(-10);
  });

  it('is empty for a degenerate outline', () => {
    expect(pitLanePoints([[0, 0]], options)).toEqual([]);
  });
});
