import { describe, expect, it } from 'vitest';
import { circuitForRace } from '@/data/circuit-for-race';
import { RACING_LINE_MARGIN_M } from '@/lib/racing-line';
import { pointAt, trackModel } from './track';

const monza = circuitForRace('Autodromo Nazionale di Monza');
const track = trackModel(monza);
const apart = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

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

  it('keeps Aster Park on its outline', () => {
    const aster = trackModel(circuitForRace('Nowhere'));
    expect(Array.from(aster.line.x)).toEqual(Array.from(aster.lap.x));
    expect(Array.from(aster.line.z)).toEqual(Array.from(aster.lap.z));
  });
});
