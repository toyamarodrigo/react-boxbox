/**
 * The Onboard view's quality levels. One is chosen from the device when the view opens, and a
 * short frame-time probe in its first seconds can step it down once. There is no setting for the
 * viewer: a phone gets a lighter scene, a desktop the full one.
 */

export type QualityLevel = 'low' | 'medium' | 'high';

/** What a quality level changes in the scene. */
export type QualitySettings = {
  /** The highest device pixel ratio the canvas draws at. */
  pixelRatio: number;
  /** Fixed when the renderer is made: a step down keeps the one it started with. */
  antialias: boolean;
  /** The sun's shadows of the cars on the track. */
  shadows: boolean;
  /** At most this many trees round a permanent circuit. */
  trees: number;
  /** A grandstand every this many metres along the main straight, where one fits. */
  standEvery: number;
  /** A building every this many metres along a street circuit, where one fits. */
  buildingEvery: number;
  /** The camera's far plane, and where the fog starts and is complete, in metres. */
  far: number;
  fog: { near: number; far: number };
  /** How far from the camera, in metres, a car switches to its far level of detail. */
  carLodM: number;
};

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  low: {
    pixelRatio: 1,
    antialias: false,
    shadows: false,
    trees: 500,
    standEvery: 72,
    buildingEvery: 40,
    far: 1500,
    fog: { near: 150, far: 1100 },
    carLodM: 40,
  },
  medium: {
    pixelRatio: 1.5,
    antialias: true,
    shadows: false,
    trees: 1000,
    standEvery: 36,
    buildingEvery: 30,
    far: 2000,
    fog: { near: 200, far: 1450 },
    carLodM: 55,
  },
  high: {
    pixelRatio: 2,
    antialias: true,
    shadows: true,
    trees: 1600,
    standEvery: 36,
    buildingEvery: 24,
    far: 2600,
    fog: { near: 250, far: 1800 },
    carLodM: 70,
  },
};

/** What the chooser knows of the device. */
export type DeviceProfile = {
  devicePixelRatio: number;
  /** A touch screen as the main pointer. */
  coarsePointer: boolean;
  /** The screen's shorter side, in CSS pixels. */
  screenShortSide: number;
  /** Logical processors; browsers that hide it report `undefined`. */
  cores: number | undefined;
};

/** A screen shorter than this on its short side is a phone's. */
const PHONE_SHORT_SIDE = 600;

/**
 * The level a device starts at. A phone (a coarse pointer or a small screen) starts at medium
 * with eight cores or more and a dense screen (a pixel ratio of 2 or more), and at low otherwise:
 * a budget phone has many slow cores and a less dense screen. Any other device starts at high,
 * or at medium with fewer than four cores. A browser that hides its cores counts as four.
 */
export function chooseQuality(device: DeviceProfile): QualityLevel {
  const cores = device.cores ?? 4;
  const phone = device.coarsePointer || device.screenShortSide < PHONE_SHORT_SIDE;
  if (phone) return cores >= 8 && device.devicePixelRatio >= 2 ? 'medium' : 'low';
  return cores >= 4 ? 'high' : 'medium';
}

/** The next level down, or `undefined` at the lowest. */
export function stepDown(level: QualityLevel): QualityLevel | undefined {
  if (level === 'high') return 'medium';
  if (level === 'medium') return 'low';
  return undefined;
}

/** The device as the browser describes it; a desktop with a fine pointer outside a browser. */
export function deviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') {
    return { devicePixelRatio: 1, coarsePointer: false, screenShortSide: 1080, cores: undefined };
  }
  return {
    devicePixelRatio: window.devicePixelRatio || 1,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    screenShortSide: Math.min(window.screen.width, window.screen.height),
    cores: navigator.hardwareConcurrency || undefined,
  };
}

/**
 * The probe's timing, in seconds: frames are skipped for `warmUp` (shaders compile, the
 * environment renders), then timed for `window`; a mean frame longer than `slowFrame` is slow.
 * A frame longer than `gap` is the tab coming back from the background and is not counted.
 */
export const PROBE = { warmUp: 1.5, window: 2.5, slowFrame: 1 / 40, gap: 0.25 } as const;

export type ProbeVerdict = 'timing' | 'fast' | 'slow';

/**
 * A frame-time probe: feed it every frame's delta, in seconds. It says `timing` until the
 * window is over, then `fast` or `slow` once, then `fast` for ever after, so a scene steps down
 * at most once. It allocates nothing per frame.
 */
export function frameProbe(timing: typeof PROBE = PROBE): (delta: number) => ProbeVerdict {
  let seen = 0;
  let timed = 0;
  let frames = 0;
  let done = false;
  return (delta) => {
    if (done) return 'fast';
    if (delta > timing.gap) return 'timing';
    seen += delta;
    if (seen <= timing.warmUp) return 'timing';
    timed += delta;
    frames++;
    if (timed < timing.window) return 'timing';
    done = true;
    return timed / frames > timing.slowFrame ? 'slow' : 'fast';
  };
}
