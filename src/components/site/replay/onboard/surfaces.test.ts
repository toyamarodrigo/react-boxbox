import { describe, expect, it } from 'vitest';
import { circuitForRace } from '@/data/circuit-for-race';
import { planTrackside } from './barriers';
import {
  BOX_SWING_M,
  GROUND,
  boxSwing,
  forEachSurfacePoint,
  gridHeight,
  groundGrid,
} from './surfaces';
import { trackModel } from './track';

describe('boxSwing', () => {
  const box = 200;

  it('keeps the car in the fast lane away from its box', () => {
    expect(boxSwing(0, box)).toBe(0);
    expect(boxSwing(box - BOX_SWING_M, box)).toBe(0);
    expect(boxSwing(box + BOX_SWING_M, box)).toBe(0);
    expect(boxSwing(box + 100, box)).toBe(0);
  });

  it('stands the car in the working lane at its box', () => {
    expect(boxSwing(box, box)).toBe(1);
  });

  it('moves across smoothly before the box and back after it, the same both ways', () => {
    const before = Array.from({ length: BOX_SWING_M + 1 }, (_, metre) =>
      boxSwing(box - BOX_SWING_M + metre, box),
    );
    for (let index = 1; index < before.length; index++) {
      expect(before[index]!).toBeGreaterThan(before[index - 1]!);
    }
    for (const metres of [1, 5, 10, 14]) {
      expect(boxSwing(box + metres, box)).toBeCloseTo(boxSwing(box - metres, box), 12);
    }
    // Eased: hardly any move across in its first and last metre.
    expect(boxSwing(box - BOX_SWING_M + 1, box)).toBeLessThan(0.02);
    expect(1 - boxSwing(box - 1, box)).toBeLessThan(0.02);
  });
});

describe('groundGrid', () => {
  it('keeps the ground under the asphalt, the run-off and the pit lane on rising ground', () => {
    // Spa's dips, Monaco's stacked streets and Interlagos's infield all rose through the track.
    for (const name of [
      'Circuit de Spa-Francorchamps',
      'Circuit de Monaco',
      'Autódromo José Carlos Pace - Interlagos',
    ]) {
      const track = trackModel(circuitForRace(name));
      const plan = planTrackside(track);
      const grid = groundGrid(track, plan);
      let worst = Number.NEGATIVE_INFINITY;
      // Between the points it was lowered at, so the check is not the carve's own samples.
      forEachSurfacePoint(
        track,
        plan,
        (x, z, y) => {
          worst = Math.max(worst, gridHeight(grid, x, z) - y);
        },
        { along: [0.25, 0.75], across: 0.5 },
      );
      expect(worst, name).toBeLessThan(-GROUND.drop / 3);
    }
  });

  it('leaves the ground where it is away from the track', () => {
    const track = trackModel(circuitForRace('Circuit de Spa-Francorchamps'));
    const grid = groundGrid(track, planTrackside(track));
    const { xs, zs, heights } = grid;
    const corner = 0;
    expect(heights[corner]).toBeCloseTo(track.groundAt(xs[0]!, zs[0]!) - GROUND.drop, 4);
  });
});
