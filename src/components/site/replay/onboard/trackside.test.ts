import { describe, expect, it } from 'vitest';
import { circuitForRace } from '@/data/circuit-for-race';
import { type Centreline, pointAt, trackModel } from './track';
import {
  corners,
  inRange,
  kerbRanges,
  lapGap,
  runoffWeight,
  signedCurvature,
  trackIndex,
} from './trackside';

/**
 * A stadium lap sampled every 2 m: a 400 m straight along `x`, a half circle of radius `r`, the
 * straight back and the other half circle. With `z` growing "down" it turns right all the way.
 */
function stadium(r = 50, straight = 400): Centreline {
  const points: [number, number][] = [];
  const step = 2;
  for (let x = 0; x < straight; x += step) points.push([x, -r]);
  for (let a = 0; a < Math.PI * r; a += step) {
    const t = -Math.PI / 2 + a / r;
    points.push([straight + r * Math.cos(t), r * Math.sin(t)]);
  }
  for (let x = straight; x > 0; x -= step) points.push([x, r]);
  for (let a = 0; a < Math.PI * r; a += step) {
    const t = Math.PI / 2 + a / r;
    points.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  const n = points.length;
  const x = Float64Array.from(points, (point) => point[0]);
  const z = Float64Array.from(points, (point) => point[1]);
  const s = new Float64Array(n + 1);
  for (let index = 1; index <= n; index++) {
    const here = index % n;
    s[index] = s[index - 1]! + Math.hypot(x[here]! - x[index - 1]!, z[here]! - z[index - 1]!);
  }
  const heading = Float64Array.from(points, (_, index) => {
    const after = (index + 1) % n;
    const before = (index - 1 + n) % n;
    return Math.atan2(z[after]! - z[before]!, x[after]! - x[before]!);
  });
  return { x, z, s, heading, length: s[n]!, nominal: s[n]!, closed: true };
}

describe('corners', () => {
  const lap = stadium();
  const found = corners(lap);

  it('reads a right turn as negative curvature, about one over its radius', () => {
    const curvature = signedCurvature(lap);
    const apex = Math.round((400 + (Math.PI * 50) / 2) / 2);
    expect(curvature[apex]!).toBeCloseTo(-1 / 50, 3);
    expect(Math.abs(curvature[100]!)).toBeLessThan(1e-9);
  });

  it('finds both half circles, turning right, at their radius', () => {
    expect(found).toHaveLength(2);
    for (const corner of found) {
      expect(corner.inside).toBe(-1);
      expect(corner.radius).toBeCloseTo(50, 0);
      expect(corner.to - corner.from).toBeGreaterThan(Math.PI * 50 - 20);
      expect(corner.apex).toBeGreaterThan(corner.from);
      expect(corner.apex).toBeLessThan(corner.to);
    }
  });

  it('finds no corner on a lap that never bends sharper than the corner radius', () => {
    expect(corners(stadium(400, 100))).toHaveLength(0);
  });
});

describe('kerbRanges', () => {
  const lap = stadium();
  const found = corners(lap);
  const kerbs = kerbRanges(found);

  it('puts an apex kerb on the inside and entry and exit kerbs on the outside', () => {
    for (const corner of found) {
      const inside = kerbs.filter((kerb) => kerb.side === corner.inside);
      const outside = kerbs.filter((kerb) => kerb.side !== corner.inside);
      expect(inside.some((kerb) => inRange(kerb, corner.apex, lap.length))).toBe(true);
      expect(outside.some((kerb) => inRange(kerb, corner.from, lap.length))).toBe(true);
      expect(outside.some((kerb) => inRange(kerb, corner.to + 5, lap.length))).toBe(true);
      expect(outside.some((kerb) => inRange(kerb, corner.apex, lap.length))).toBe(false);
      expect(inside.some((kerb) => inRange(kerb, corner.from + 2, lap.length))).toBe(false);
    }
  });

  it('leaves the middle of the straights bare', () => {
    expect(kerbs.some((kerb) => inRange(kerb, 200, lap.length))).toBe(false);
  });

  it('joins overlapping kerbs on one side', () => {
    // Two left-handers close together: the first's exit kerb runs into the second's entry kerb.
    const joined = kerbRanges([
      { from: 0, apex: 10, to: 20, inside: 1, radius: 30 },
      { from: 25, apex: 35, to: 45, inside: 1, radius: 30 },
    ]);
    expect(joined.filter((kerb) => kerb.side === -1)).toEqual([
      { from: -10, to: 6, side: -1 },
      { from: 14, to: 35, side: -1 },
      { from: 39, to: 60, side: -1 },
    ]);
  });
});

describe('runoffWeight', () => {
  const lap = stadium();
  const found = corners(lap);
  const apex = found[0]!.apex;

  it('widens the run-off on the outside of a corner and past its exit, never inside', () => {
    expect(runoffWeight(found, lap.length, apex, 1)).toBe(1);
    expect(runoffWeight(found, lap.length, found[0]!.to + 50, 1)).toBe(1);
    expect(runoffWeight(found, lap.length, apex, -1)).toBe(0);
    expect(runoffWeight(found, lap.length, 200, 1)).toBe(0);
  });
});

describe('lapGap', () => {
  it('measures the short way round', () => {
    expect(lapGap(10, 990, 1000)).toBe(20);
    expect(lapGap(990, 10, 1000)).toBe(20);
  });
});

describe('trackIndex', () => {
  const lap = stadium();
  const index = trackIndex([lap]);

  it('tells a place on the track from one clear of it', () => {
    expect(index.near(200, -48, 5)).toBe(true);
    expect(index.near(200, 0, 30)).toBe(false);
  });

  it('skips the samples it is told to', () => {
    expect(index.near(200, -48, 5, (_, s) => lapGap(s, 200, lap.length) < 30)).toBe(false);
  });
});

describe('the pit lane', () => {
  it('leaves and rejoins the lap with no gap, on every circuit tested', () => {
    for (const name of ['Circuit de Spa-Francorchamps', 'Autodromo Nazionale di Monza']) {
      const circuit = circuitForRace(name);
      const { lap, pit } = trackModel(circuit);
      const entry = pointAt(lap, circuit.pit.entry * circuit.lengthM);
      const exit = pointAt(lap, circuit.pit.exit * circuit.lengthM);
      const start = pointAt(pit, 0);
      const end = pointAt(pit, circuit.pitLengthM);
      expect(Math.hypot(start.x - entry.x, start.z - entry.z)).toBeLessThan(0.01);
      expect(Math.hypot(end.x - exit.x, end.z - exit.z)).toBeLessThan(0.01);
    }
  });
});
