import { describe, expect, it } from 'vitest';
import { CIRCUITS } from '@/data/circuits';
import { WHOLE_LAP, timeShareAt } from '@/data/speed-profile';
import {
  PROFILE_POINTS,
  TOP_SPEED,
  outlineSpeeds,
  speedProfileFromOutline,
} from './outline-speed-profile';

const STRAIGHT_M = 1000;
const HAIRPIN_RADIUS_M = 15;

/**
 * A stadium in metres: a straight from the line, a hairpin, the straight back and another
 * hairpin. The straights carry a small zigzag, the kind of noise a GeoJSON outline has.
 */
function stadium(noiseM = 0): { d: string; lengthM: number } {
  const points: [number, number][] = [];
  const r = HAIRPIN_RADIUS_M;
  for (let x = 0; x < STRAIGHT_M; x += 10) points.push([x, (x / 10) % 2 === 0 ? 0 : noiseM]);
  for (let step = 0; step < 20; step++) {
    const angle = -Math.PI / 2 + (Math.PI * step) / 20;
    points.push([STRAIGHT_M + r * Math.cos(angle), r + r * Math.sin(angle)]);
  }
  for (let x = STRAIGHT_M; x > 0; x -= 10) {
    points.push([x, 2 * r + ((x / 10) % 2 === 0 ? 0 : noiseM)]);
  }
  for (let step = 0; step < 20; step++) {
    const angle = Math.PI / 2 + (Math.PI * step) / 20;
    points.push([r * Math.cos(angle), r + r * Math.sin(angle)]);
  }
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  let lengthM = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    lengthM += Math.hypot(bx - ax, by - ay);
  }
  return { d: `${d} Z`, lengthM };
}

/** The modelled speed `metres` after the line, in km/h. */
const kmhAt = (speeds: Float64Array, stepM: number, metres: number) =>
  speeds[Math.round(metres / stepM)]! * 3.6;

describe('speedProfileFromOutline', () => {
  const { d, lengthM } = stadium(0.3);
  const { stepM, flying, standing } = outlineSpeeds(d, lengthM);
  const hairpin = STRAIGHT_M + (Math.PI * HAIRPIN_RADIUS_M) / 2;

  it('is slow in the hairpin and fast on the straight, zigzag and all', () => {
    expect(kmhAt(flying, stepM, hairpin)).toBeLessThan(100);
    expect(kmhAt(flying, stepM, hairpin)).toBeGreaterThan(50);
    expect(kmhAt(flying, stepM, STRAIGHT_M * 0.7)).toBeGreaterThan(300);
    expect(Math.max(...flying)).toBeLessThanOrEqual(TOP_SPEED);
  });

  it('brakes before the hairpin rather than in it', () => {
    expect(kmhAt(flying, stepM, STRAIGHT_M - 50)).toBeGreaterThan(kmhAt(flying, stepM, hairpin));
    expect(kmhAt(flying, stepM, STRAIGHT_M - 50)).toBeLessThan(kmhAt(flying, stepM, 700));
  });

  it('spends more of the lap in the hairpin than on as much straight', () => {
    const profile = speedProfileFromOutline(d, lengthM);
    const around = (metres: number) =>
      timeShareAt(profile, WHOLE_LAP, (metres + 20) / lengthM) -
      timeShareAt(profile, WHOLE_LAP, (metres - 20) / lengthM);
    expect(around(hairpin)).toBeGreaterThan(3 * around(STRAIGHT_M * 0.7));
  });

  it('starts lap 1 from rest and joins the flying lap before the hairpin', () => {
    expect(standing[0]).toBe(0);
    expect(flying[0]).toBeGreaterThan(20);
    expect(standing[Math.round(hairpin / stepM)]).toBe(flying[Math.round(hairpin / stepM)]);
    const profile = speedProfileFromOutline(d, lengthM);
    expect(profile.start[1]!).toBeGreaterThan(3 * profile.time[1]!);
  });
});

describe('the generated circuits', () => {
  it.each(CIRCUITS.map((circuit) => [circuit.id, circuit] as const))(
    '%s carries one lap of valid speed profile, up to date with its outline',
    (_id, circuit) => {
      for (const time of [circuit.profile.time, circuit.profile.start]) {
        expect(time).toHaveLength(PROFILE_POINTS);
        expect(time[0]).toBe(0);
        expect(time.at(-1)).toBe(1);
        for (let i = 1; i < time.length; i++) expect(time[i]!).toBeGreaterThan(time[i - 1]!);
      }
      expect(speedProfileFromOutline(circuit.d, circuit.lengthM)).toEqual(circuit.profile);
    },
  );
});
