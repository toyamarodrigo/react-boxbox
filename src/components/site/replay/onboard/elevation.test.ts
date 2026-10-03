import { describe, expect, it } from 'vitest';
import { type BufferGeometry, Mesh } from 'three';
import { circuitForRace } from '@/data/circuit-for-race';
import { elevationAt } from '@/lib/elevation';
import { buildScenery } from './scenery';
import { GROUND, groundAxis } from './surfaces';
import { groundHeight, pitchAt, pointAt, trackModel } from './track';

/** Spa's outline with one invented hill round the lap, 80 m high halfway round. */
const spa = circuitForRace('Circuit de Spa-Francorchamps');
const samples = Math.round(spa.lengthM / 20);
const hill = Array.from(
  { length: samples },
  (_, index) => 40 * (1 - Math.cos((2 * Math.PI * index) / samples)),
);
const raised = trackModel({ ...spa, elevation: hill });
const flat = trackModel({ ...spa, elevation: [] });

describe('the track model on rising ground', () => {
  it('lifts the lap and the racing line to the elevation at their share of the lap', () => {
    for (let metres = 0; metres < spa.lengthM; metres += 250) {
      const wanted = elevationAt(hill, metres / spa.lengthM);
      expect(Math.abs(pointAt(raised.lap, metres).y - wanted)).toBeLessThan(0.5);
      expect(pointAt(raised.line, metres).y).toBeCloseTo(pointAt(raised.lap, metres).y, 6);
    }
  });

  it('puts the pit lane at the height of the lap where it leaves and rejoins it', () => {
    const entry = pointAt(raised.lap, spa.pit.entry * spa.lengthM).y;
    const exit = pointAt(raised.lap, spa.pit.exit * spa.lengthM).y;
    expect(Math.abs(pointAt(raised.pit, 0).y - entry)).toBeLessThan(1);
    expect(Math.abs(pointAt(raised.pitLine, spa.pitLengthM).y - exit)).toBeLessThan(1);
  });

  it('pitches the cars nose up uphill and nose down downhill', () => {
    // The hill rises over the first half of the lap and falls over the second.
    expect(pitchAt(raised.line, spa.lengthM * 0.25)).toBeGreaterThan(0.005);
    expect(pitchAt(raised.line, spa.lengthM * 0.75)).toBeLessThan(-0.005);
    expect(pitchAt(flat.line, spa.lengthM * 0.25)).toBe(0);
  });

  it('keeps a circuit without elevation flat', () => {
    expect(flat.elevated).toBe(false);
    expect(pointAt(flat.lap, 1234).y).toBe(0);
    expect(flat.groundAt(flat.centre.x, flat.centre.z)).toBe(0);
  });
});

describe('groundHeight', () => {
  it('is the lap height on the lap and stays inside its heights away from it', () => {
    const ground = groundHeight(raised.lap);
    const heights = Array.from(raised.lap.y!);
    const [lowest, highest] = [Math.min(...heights), Math.max(...heights)];
    for (let index = 0; index < raised.lap.x.length; index += 97) {
      const on = ground(raised.lap.x[index]!, raised.lap.z[index]!);
      expect(Math.abs(on - raised.lap.y![index]!)).toBeLessThan(0.5);
    }
    for (const [dx, dz] of [
      [0, 0],
      [3000, 0],
      [-500, 2500],
    ] as const) {
      const away = ground(raised.centre.x + dx, raised.centre.z + dz);
      expect(away).toBeGreaterThanOrEqual(lowest);
      expect(away).toBeLessThanOrEqual(highest);
    }
  });
});

describe('the ground on rising ground', () => {
  it('spaces its grid finely over the circuit and wider out to the horizon', () => {
    const axis = groundAxis(0, 300, 1000);
    expect(axis[0]).toBe(-1000);
    expect(axis.at(-1)).toBe(1300);
    expect(axis).toContain(0);
    expect(axis[axis.indexOf(0) + 1]! - 0).toBeCloseTo(GROUND.step, 6);
    for (let index = 1; index < axis.length; index++)
      expect(axis[index]!).toBeGreaterThan(axis[index - 1]!);
  });

  it('builds a heightfield just under the lap, without holes', () => {
    const group = buildScenery(raised);
    const meshes: Mesh[] = [];
    group.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    const ground = meshes.find((mesh) => mesh.renderOrder === -9)!;
    const geometry = ground.geometry as BufferGeometry;
    const positions = geometry.getAttribute('position');
    let highest = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < positions.count; index++) {
      expect(Number.isFinite(positions.getY(index))).toBe(true);
      highest = Math.max(highest, positions.getY(index));
    }
    expect(highest).toBeGreaterThan(60);
    // A full grid: two triangles for every cell, so about six indices a vertex.
    expect(geometry.index!.count % 6).toBe(0);
    expect(geometry.index!.count).toBeGreaterThan(positions.count * 5);
  });
});
