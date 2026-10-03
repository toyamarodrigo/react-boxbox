import { describe, expect, it } from 'vitest';
import { circuitForRace } from '@/data/circuit-for-race';
import { CIRCUITS } from '@/data/circuits';
import { RACING_LINE_MARGIN_M } from '@/lib/racing-line';
import { type Centreline, angleDelta, offsetAt, pointAt, trackModel } from './track';

const monza = circuitForRace('Autodromo Nazionale di Monza');
const track = trackModel(monza);
const apart = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

/**
 * The most a closed line turns at a sample more or less than the mean of the samples either side,
 * in degrees: a kink shows as a spike, a curve that tightens smoothly does not.
 */
function sharpestKink({ x, z }: Centreline): number {
  const n = x.length;
  const direction = (from: number, to: number) => Math.atan2(z[to]! - z[from]!, x[to]! - x[from]!);
  const turn = (index: number) =>
    angleDelta(direction((index - 1 + n) % n, index), direction(index, (index + 1) % n));
  let sharpest = 0;
  for (let index = 0; index < n; index++) {
    const around = (turn((index - 1 + n) % n) + turn((index + 1) % n)) / 2;
    sharpest = Math.max(sharpest, Math.abs(turn(index) - around));
  }
  return (sharpest * 180) / Math.PI;
}

describe('trackModel', () => {
  it('keeps the racing line inside the track, as far along the lap as the outline', () => {
    const limit = monza.widthM / 2 - RACING_LINE_MARGIN_M;
    let widest = 0;
    for (let metres = 0; metres < monza.lengthM; metres += 7) {
      const sideways = apart(pointAt(track.line, metres), pointAt(track.lap, metres));
      expect(sideways).toBeLessThanOrEqual(limit + 0.05);
      widest = Math.max(widest, sideways);
    }
    expect(widest).toBeGreaterThan(0.9 * limit);
    expect(track.line.length).toBe(track.lap.length);
  });

  it('joins the pit lane to the racing line, no further off than the lane is from the outline', () => {
    // Miami's line is near an edge at both ends of the lane, so a lane left on the outline would
    // jump about 5 m sideways there.
    const miami = circuitForRace('Miami International Autodrome');
    const { lap, line, pit, pitLine } = trackModel(miami);
    for (const [share, metres] of [
      [miami.pit.entry, 0],
      [miami.pit.exit, miami.pitLengthM],
    ] as const) {
      const outlineGap = apart(pointAt(pit, metres), pointAt(lap, share * miami.lengthM));
      const lineGap = apart(pointAt(pitLine, metres), pointAt(line, share * miami.lengthM));
      expect(
        apart(pointAt(line, share * miami.lengthM), pointAt(lap, share * miami.lengthM)),
      ).toBeGreaterThan(4);
      expect(lineGap).toBeLessThan(outlineGap + 0.5);
    }
  });

  it("keeps every circuit's racing line inside the track", () => {
    for (const { name } of CIRCUITS) {
      const circuit = circuitForRace(name);
      const { lap, line } = trackModel(circuit);
      const limit = circuit.widthM / 2 - RACING_LINE_MARGIN_M;
      for (let metres = 0; metres < circuit.lengthM; metres += 1) {
        expect(apart(pointAt(line, metres), pointAt(lap, metres))).toBeLessThanOrEqual(
          limit + 0.05,
        );
      }
    }
  });

  it('bends the racing line through its nodes without a kink', () => {
    // Monaco's tight corners move the line across the track fastest. Read straight between its
    // nodes, every 12 m, the line turned up to 26° more or less at a node than either side.
    const { line } = trackModel(circuitForRace('Circuit de Monaco'));
    expect(sharpestKink(line)).toBeLessThan(10);
  });

  it('keeps Aster Park on its outline', () => {
    const aster = trackModel(circuitForRace('Nowhere'));
    expect(Array.from(aster.line.x)).toEqual(Array.from(aster.lap.x));
    expect(Array.from(aster.line.z)).toEqual(Array.from(aster.lap.z));
  });
});

describe('offsetAt', () => {
  it('stays between the two nodes either side, wrapping round the lap', () => {
    const nodes = monza.racingLine;
    const n = nodes.length;
    for (let step = 0; step < n * 10; step++) {
      const at = step / 10;
      const a = nodes[Math.floor(at) % n]!;
      const b = nodes[(Math.floor(at) + 1) % n]!;
      const offset = offsetAt(nodes, at / n);
      expect(offset).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-9);
      expect(offset).toBeLessThanOrEqual(Math.max(a, b) + 1e-9);
    }
    expect(offsetAt(nodes, 1.25)).toBeCloseTo(offsetAt(nodes, 0.25), 9);
    expect(offsetAt(nodes, -0.75)).toBeCloseTo(offsetAt(nodes, 0.25), 9);
  });

  it('leaves no node at Monaco with a kink in the line', () => {
    // Read straight between the nodes, the slope changed by up to 16° at a node.
    const monaco = circuitForRace('Circuit de Monaco');
    const nodes = monaco.racingLine;
    const n = nodes.length;
    const spacing = monaco.lengthM / n;
    const step = 1e-6;
    let sharpest = 0;
    for (let index = 0; index < n; index++) {
      const at = offsetAt(nodes, index / n);
      const into = (at - offsetAt(nodes, (index - step) / n)) / (step * spacing);
      const out = (offsetAt(nodes, (index + step) / n) - at) / (step * spacing);
      sharpest = Math.max(sharpest, Math.abs(Math.atan(out) - Math.atan(into)));
    }
    expect((sharpest * 180) / Math.PI).toBeLessThan(0.1);
  });

  it('meets every node exactly', () => {
    const nodes = monza.racingLine;
    nodes.forEach((node, index) => {
      expect(offsetAt(nodes, index / nodes.length)).toBeCloseTo(node, 9);
    });
  });
});
