import { describe, expect, it } from 'vitest';
import { type Point, offsetPoints, racingLineOffsets } from './racing-line';

const STEP_M = 4;
const STRAIGHT_M = 1000;
const HAIRPIN_RADIUS_M = 15;
/** A 12 m track less a 1 m margin each side. */
const LIMIT_M = 5;

/**
 * A stadium in metres, a point every 4 m: a straight along `+x` from the line, a hairpin, the
 * straight back and another hairpin. Seen as the Track Map draws it (`y` down), both hairpins turn
 * right, so the inside is to the right of travel (negative offsets) and the outside to the left.
 * `jog` shifts the first straight sideways between `x` 400 and 500, a chicane.
 */
function stadium(jog?: (x: number) => number): Point[] {
  const points: Point[] = [];
  const r = HAIRPIN_RADIUS_M;
  for (let x = 0; x < STRAIGHT_M; x += STEP_M) points.push([x, jog?.(x) ?? 0]);
  for (let angle = -Math.PI / 2; angle < Math.PI / 2 - 1e-9; angle += STEP_M / r) {
    points.push([STRAIGHT_M + r * Math.cos(angle), r + r * Math.sin(angle)]);
  }
  for (let x = STRAIGHT_M; x > 0; x -= STEP_M) points.push([x, 2 * r]);
  for (let angle = Math.PI / 2; angle < (3 * Math.PI) / 2 - 1e-9; angle += STEP_M / r) {
    points.push([r * Math.cos(angle), r + r * Math.sin(angle)]);
  }
  return points;
}

/** The sample nearest `metres` along the stadium from the line. */
const at = (metres: number) => Math.round(metres / STEP_M);

/** The largest turn per metre over a stretch of a line, measured between its samples. */
function sharpest(points: readonly Point[], from: number, to: number): number {
  let most = 0;
  for (let index = from; index < to; index++) {
    const [ax, ay] = points[index - 1]!;
    const [bx, by] = points[index]!;
    const [cx, cy] = points[index + 1]!;
    const turn = Math.abs(Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax));
    most = Math.max(most, turn / Math.hypot(cx - ax, cy - ay));
  }
  return most;
}

describe('racingLineOffsets', () => {
  it('goes wide into the hairpin, tight at its apex and wide out of it', () => {
    const offsets = racingLineOffsets(stadium(), LIMIT_M);
    const apex = STRAIGHT_M + (Math.PI * HAIRPIN_RADIUS_M) / 2;
    const exit = STRAIGHT_M + Math.PI * HAIRPIN_RADIUS_M;
    expect(offsets[at(STRAIGHT_M - 50)]).toBeGreaterThan(0.6 * LIMIT_M);
    expect(offsets[at(apex)]).toBeLessThan(-0.9 * LIMIT_M);
    expect(offsets[at(exit + 50)]).toBeGreaterThan(0.6 * LIMIT_M);
  });

  it('stays near the middle on a long straight', () => {
    const offsets = racingLineOffsets(stadium(), LIMIT_M);
    expect(Math.abs(offsets[at(STRAIGHT_M / 2)]!)).toBeLessThan(0.5);
  });

  it('straightens a chicane, clipping its apex', () => {
    // 9 m to the left over 30 m, held for 40 m, and back over 30 m: more than the 10 m of room.
    const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;
    const jog = (x: number) => -9 * (ease((x - 400) / 30) - ease((x - 470) / 30));
    const centre = stadium(jog);
    const offsets = racingLineOffsets(centre, LIMIT_M);
    const line = offsetPoints(centre, offsets);
    const [from, to] = [at(380), at(520)];
    const sideways = line.slice(from, to).map(([, y]) => y);
    expect(Math.max(...sideways) - Math.min(...sideways)).toBeLessThan(2);
    expect(sharpest(line, from, to)).toBeLessThan(0.3 * sharpest(centre, from, to));
    // Left of the middle before and after, on the right-hand edge where the track is shifted.
    expect(offsets[at(392)]).toBeGreaterThan(0.5 * LIMIT_M);
    expect(offsets[at(504)]).toBeGreaterThan(0.5 * LIMIT_M);
    for (const metres of [440, 456, 468]) expect(offsets[at(metres)]).toBeLessThan(-0.9 * LIMIT_M);
  });

  it('never leaves the bounds', () => {
    for (const limit of [0, 2.5, LIMIT_M]) {
      const offsets = racingLineOffsets(stadium(), limit);
      expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(limit);
    }
  });
});
