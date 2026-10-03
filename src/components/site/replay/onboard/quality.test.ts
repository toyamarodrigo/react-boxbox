import { describe, expect, it } from 'vitest';
import { type DeviceProfile, PROBE, QUALITY, chooseQuality, frameProbe, stepDown } from './quality';

const desktop: DeviceProfile = {
  devicePixelRatio: 2,
  coarsePointer: false,
  screenShortSide: 1080,
  cores: 10,
};
const phone: DeviceProfile = {
  devicePixelRatio: 3,
  coarsePointer: true,
  screenShortSide: 390,
  cores: 8,
};

describe('chooseQuality', () => {
  it('gives a desktop the full scene, and a desktop with few cores the middle one', () => {
    expect(chooseQuality(desktop)).toBe('high');
    expect(chooseQuality({ ...desktop, devicePixelRatio: 1 })).toBe('high');
    expect(chooseQuality({ ...desktop, cores: 2 })).toBe('medium');
  });

  it('starts a phone at medium with many cores and a dense screen, at low otherwise', () => {
    expect(chooseQuality(phone)).toBe('medium');
    expect(chooseQuality({ ...phone, cores: 6 })).toBe('low');
    expect(chooseQuality({ ...phone, devicePixelRatio: 1.75 })).toBe('low');
  });

  it('takes a small screen or a coarse pointer alone for a phone', () => {
    expect(chooseQuality({ ...desktop, coarsePointer: true, cores: 4 })).toBe('low');
    expect(chooseQuality({ ...desktop, screenShortSide: 400, cores: 4 })).toBe('low');
  });

  it('counts a browser that hides its cores as four', () => {
    expect(chooseQuality({ ...desktop, cores: undefined })).toBe('high');
    expect(chooseQuality({ ...phone, cores: undefined })).toBe('low');
  });
});

describe('quality levels', () => {
  it('step down from high to low and no further', () => {
    expect(stepDown('high')).toBe('medium');
    expect(stepDown('medium')).toBe('low');
    expect(stepDown('low')).toBeUndefined();
  });

  it('cost less at every level down', () => {
    const levels = [QUALITY.high, QUALITY.medium, QUALITY.low];
    for (const [index, level] of levels.entries()) {
      const below = levels[index + 1];
      if (!below) continue;
      expect(below.pixelRatio).toBeLessThan(level.pixelRatio);
      expect(below.trees).toBeLessThan(level.trees);
      expect(below.far).toBeLessThan(level.far);
      expect(below.carLodM).toBeLessThan(level.carLodM);
      expect(below.standEvery).toBeGreaterThanOrEqual(level.standEvery);
      expect(below.fog.far).toBeLessThan(below.far);
    }
    expect(QUALITY.high.shadows).toBe(true);
    expect(QUALITY.low).toMatchObject({ pixelRatio: 1, antialias: false, shadows: false });
  });
});

describe('frameProbe', () => {
  /** Feeds `seconds` of frames of `frame` seconds each; the verdicts it gave. */
  const feed = (probe: ReturnType<typeof frameProbe>, frame: number, seconds: number) => {
    const verdicts = new Set<string>();
    for (let time = 0; time < seconds; time += frame) verdicts.add(probe(frame));
    return verdicts;
  };

  it('times after the warm-up and calls fast frames fast', () => {
    const probe = frameProbe();
    expect(feed(probe, 1 / 60, PROBE.warmUp)).toEqual(new Set(['timing']));
    expect(feed(probe, 1 / 60, PROBE.window + 0.1)).toEqual(new Set(['timing', 'fast']));
  });

  it('calls slow frames slow once, and fast for ever after', () => {
    const probe = frameProbe();
    const verdicts: string[] = [];
    for (let frame = 0; frame < 200; frame++) verdicts.push(probe(1 / 20));
    expect(verdicts.filter((verdict) => verdict === 'slow')).toHaveLength(1);
    expect(verdicts.at(-1)).toBe('fast');
  });

  it('leaves out a frame after the tab was in the background', () => {
    const probe = frameProbe();
    feed(probe, 1 / 60, PROBE.warmUp + 0.1);
    probe(5);
    expect(feed(probe, 1 / 60, PROBE.window + 0.1)).toEqual(new Set(['timing', 'fast']));
  });
});
