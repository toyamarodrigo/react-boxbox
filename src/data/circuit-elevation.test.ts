import { describe, expect, it } from 'vitest';
import { ELEVATION_DECIMALS, ELEVATION_STEP_M, MAX_GRADE } from '@/lib/elevation';
import { CIRCUIT_ELEVATION } from './circuit-elevation';
import { CIRCUITS } from './circuits';

/**
 * The generated elevation. These turn on once `bun run circuits:elevation` has filled
 * `circuit-elevation.ts`; until then each is skipped.
 */
const generated = Object.keys(CIRCUIT_ELEVATION).length > 0;
const rangeOf = (id: string) => {
  const heights = CIRCUIT_ELEVATION[id]?.heights ?? [];
  return Math.max(...heights) - Math.min(...heights);
};

describe('CIRCUIT_ELEVATION', () => {
  it.skipIf(!generated)('has every circuit, and nothing else', () => {
    expect(Object.keys(CIRCUIT_ELEVATION).sort()).toEqual(CIRCUITS.map((c) => c.id).sort());
  });

  it.skipIf(!generated)(
    'closes every lap and never steps further than the gradient limit allows',
    () => {
      for (const circuit of CIRCUITS) {
        const heights = CIRCUIT_ELEVATION[circuit.id]?.heights ?? [];
        expect(heights.length, circuit.id).toBeGreaterThan(0);
        expect(
          Math.abs(heights.length * ELEVATION_STEP_M - circuit.lengthM),
          circuit.id,
        ).toBeLessThan(ELEVATION_STEP_M);
        expect(Math.min(...heights), circuit.id).toBe(0);
        // Every step, the one from the last height back to the first included: the lap is closed.
        const step = circuit.lengthM / heights.length;
        const limit = MAX_GRADE * step + 10 ** -ELEVATION_DECIMALS + 1e-9;
        for (const [index, height] of heights.entries()) {
          const next = heights[(index + 1) % heights.length]!;
          expect(Math.abs(next - height), `${circuit.id} at ${index}`).toBeLessThanOrEqual(limit);
        }
        // No F1 circuit climbs more than about 110 m round a lap.
        expect(rangeOf(circuit.id), circuit.id).toBeLessThan(150);
      }
    },
  );

  it.skipIf(!CIRCUIT_ELEVATION['be-1925'])('climbs about 100 m round Spa-Francorchamps', () => {
    expect(rangeOf('be-1925')).toBeGreaterThanOrEqual(70);
    expect(rangeOf('be-1925')).toBeLessThanOrEqual(130);
  });

  it.skipIf(!CIRCUIT_ELEVATION['it-1922'])('keeps Monza nearly flat', () => {
    expect(rangeOf('it-1922')).toBeLessThan(25);
  });

  it.skipIf(!CIRCUIT_ELEVATION['az-2016'])('takes Baku from SRTM, which GLO-30 leaves out', () => {
    expect(CIRCUIT_ELEVATION['az-2016']?.source).toBe('srtm');
  });
});
