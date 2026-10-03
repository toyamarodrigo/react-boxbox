import { describe, expect, it } from 'vitest';
import { BOX_SWING_M, boxSwing } from './surfaces';

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
