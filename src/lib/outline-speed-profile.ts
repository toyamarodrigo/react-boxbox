/**
 * Builds a circuit's speed profile (ADR 0005) from its outline, for `circuits:build`.
 *
 * The outline is resampled evenly in metres and smoothed, so the kinks between the source's
 * points do not read as corners. Each point gets a corner speed from a lateral grip limit and
 * the curvature there, capped at a top speed; a forward pass then limits how fast a car can
 * accelerate out of each corner and a backward pass how late it can brake into the next one,
 * both round the closed loop so the line itself is braked and accelerated through. The time
 * each stretch takes is added up into shares of the lap's time.
 *
 * A model, never telemetry: the speeds only shape how a lap's real time is shared out.
 */
import type { SpeedProfile } from '../data/speed-profile';
import { RACING_LINE_MARGIN_M, offsetPoints, racingLineOffsets } from './racing-line';

/** Distance between the evenly spaced points the speeds are worked out at. */
export const SAMPLE_STEP_M = 4;
/** Half the width of the moving average that smooths the outline, in samples (about 12 m). */
export const SMOOTH_RADIUS = 3;
/** How many times the moving average runs. */
export const SMOOTH_PASSES = 2;
/** Half the window the curvature is measured over, in samples (about 12 m each way). */
export const CURVATURE_HALF_WINDOW = 3;
/** Lateral grip, about 3 g: the corner speed is `sqrt(LATERAL_GRIP / curvature)`, in m/s². */
export const LATERAL_GRIP = 30;
/** Top speed, about 342 km/h, in m/s. */
export const TOP_SPEED = 95;
/** Acceleration from low speed in m/s², fading towards zero at top speed. */
export const ACCELERATION = 14;
/** The least acceleration left near top speed, so a car still creeps up to it, in m/s². */
export const MIN_ACCELERATION = 0.5;
/** Braking, about 4.5 g, in m/s². */
export const BRAKING = 44;
/** How many evenly spaced points the generated profile keeps, line to line. */
export const PROFILE_POINTS = 201;
/** Decimals the generated time shares are rounded to. */
export const PROFILE_DECIMALS = 4;
/** Distance between the stored racing line's offsets, in metres (about every third sample). */
export const RACING_LINE_STEP_M = 12;
/** Decimals the stored racing line's offsets are rounded to (10 cm). */
export const RACING_LINE_DECIMALS = 1;

type Point = readonly [number, number];

/** The outlines are `M x y L x y … Z`, so every number is one half of a point. */
function parseOutline(d: string): Point[] {
  const numbers = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const points: Point[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push([numbers[index]!, numbers[index + 1]!]);
  }
  return points;
}

const segmentLength = (points: readonly Point[], index: number) => {
  const [ax, ay] = points[index]!;
  const [bx, by] = points[(index + 1) % points.length]!;
  return Math.hypot(bx - ax, by - ay);
};

/** `count` points evenly spaced round the closed outline, the first on the line. */
function resample(points: readonly Point[], count: number): Point[] {
  let total = 0;
  for (let index = 0; index < points.length; index++) total += segmentLength(points, index);
  const out: Point[] = [];
  let segment = 0;
  let segmentStart = 0;
  for (let index = 0; index < count; index++) {
    const wanted = (index * total) / count;
    let length = segmentLength(points, segment);
    while (wanted > segmentStart + length && segment < points.length - 1) {
      segmentStart += length;
      segment++;
      length = segmentLength(points, segment);
    }
    const [ax, ay] = points[segment]!;
    const [bx, by] = points[(segment + 1) % points.length]!;
    const t = length === 0 ? 0 : Math.min(1, (wanted - segmentStart) / length);
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return out;
}

/** A moving average round the loop, so the source's kinks round off into its real corners. */
function smooth(points: readonly Point[]): readonly Point[] {
  let current = points;
  const n = points.length;
  const width = 2 * SMOOTH_RADIUS + 1;
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next: Point[] = [];
    for (let index = 0; index < n; index++) {
      let sx = 0;
      let sy = 0;
      for (let offset = -SMOOTH_RADIUS; offset <= SMOOTH_RADIUS; offset++) {
        const [x, y] = current[(index + offset + n) % n]!;
        sx += x;
        sy += y;
      }
      next.push([sx / width, sy / width]);
    }
    current = next;
  }
  return current;
}

/** The difference `b - a` between two angles, in (-π, π]. */
function angleDelta(a: number, b: number): number {
  let delta = (b - a) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta <= -Math.PI) delta += 2 * Math.PI;
  return delta;
}

const windowLength = (points: readonly Point[], index: number, k: number) => {
  const n = points.length;
  let length = 0;
  for (let at = index - k; at < index + k; at++) length += segmentLength(points, (at + n) % n);
  return length;
};

/**
 * The fastest a car takes each point: the grip limit for the racing line's curvature there, under
 * top speed. The turn is measured on the line, over the outline's distance stretched by how much
 * longer the line is there than the outline, so a line on the outline reads the outline's corners.
 */
function cornerSpeeds(
  line: readonly Point[],
  outline: readonly Point[],
  stepM: number,
): Float64Array {
  const n = line.length;
  const heading = line.map((_, index) => {
    const [ax, ay] = line[(index - 1 + n) % n]!;
    const [bx, by] = line[(index + 1) % n]!;
    return Math.atan2(by - ay, bx - ax);
  });
  const k = CURVATURE_HALF_WINDOW;
  const caps = new Float64Array(n);
  for (let index = 0; index < n; index++) {
    const turn = Math.abs(angleDelta(heading[(index - k + n) % n]!, heading[(index + k) % n]!));
    const outlineLength = windowLength(outline, index, k);
    const stretch =
      line === outline || outlineLength === 0 ? 1 : windowLength(line, index, k) / outlineLength;
    const curvature = turn / (2 * k * stepM * stretch);
    caps[index] = Math.min(TOP_SPEED, Math.sqrt(LATERAL_GRIP / Math.max(curvature, 1e-9)));
  }
  return caps;
}

const accelerationAt = (speed: number) =>
  Math.max(MIN_ACCELERATION, ACCELERATION * (1 - (speed / TOP_SPEED) ** 2));

/**
 * The acceleration limit, forwards. A flying lap goes round twice, so the line carries the speed
 * of the lap before it; a standing start goes round once from rest at the line.
 */
function forwardPass(caps: Float64Array, stepM: number, standing: boolean): Float64Array {
  const n = caps.length;
  const speeds = Float64Array.from(caps);
  if (standing) speeds[0] = 0;
  for (let at = 1; at < (standing ? n : 2 * n); at++) {
    const here = at % n;
    const before = speeds[(at - 1) % n]!;
    const reachable = Math.sqrt(before ** 2 + 2 * accelerationAt(before) * stepM);
    speeds[here] = Math.min(speeds[here]!, reachable);
  }
  return speeds;
}

/** The braking limit, backwards round the loop twice, so the line brakes for the first corner. */
function backwardPass(speeds: Float64Array, stepM: number): Float64Array {
  const n = speeds.length;
  const out = Float64Array.from(speeds);
  for (let at = 2 * n - 1; at >= 0; at--) {
    const here = at % n;
    const after = out[(here + 1) % n]!;
    out[here] = Math.min(out[here]!, Math.sqrt(after ** 2 + 2 * BRAKING * stepM));
  }
  return out;
}

/** A lap's modelled speeds, in m/s, at evenly spaced points `stepM` apart, the line first. */
export type OutlineSpeeds = {
  stepM: number;
  /** A flying lap: the line is crossed at the speed the lap ends with. */
  flying: Float64Array;
  /** Lap 1: from rest at the line, then the flying lap wherever that is slower. */
  standing: Float64Array;
  /** The racing line's offset at each point, metres to the left of travel; zeros without a width. */
  offsets: Float64Array;
};

/** The outline resampled every `stepM` and smoothed, in metres, the line first. */
function lapSamples(d: string, lengthM: number): { points: Point[]; stepM: number } {
  const outline = parseOutline(d);
  if (outline.length < 3 || !(lengthM > 0)) throw new Error('outline: expected a closed lap');
  let drawn = 0;
  for (let index = 0; index < outline.length; index++) drawn += segmentLength(outline, index);
  const metres = lengthM / drawn;
  const count = Math.max(4 * CURVATURE_HALF_WINDOW, Math.round(lengthM / SAMPLE_STEP_M));
  const points = smooth(resample(outline, count)).map(([x, y]): Point => [x * metres, y * metres]);
  return { points, stepM: lengthM / count };
}

/**
 * The modelled speeds round a closed outline: `d` in `viewBox` units (`M x y L x y … Z`), scaled
 * to `lengthM` metres. With the track's `widthM`, the speeds are worked out along the racing line
 * inside it (ADR 0005 amendment); without, along the outline itself.
 */
export function outlineSpeeds(d: string, lengthM: number, widthM?: number): OutlineSpeeds {
  const { points, stepM } = lapSamples(d, lengthM);
  const offsets =
    widthM === undefined
      ? new Float64Array(points.length)
      : racingLineOffsets(points, widthM / 2 - RACING_LINE_MARGIN_M);
  const line = widthM === undefined ? points : offsetPoints(points, offsets);
  const caps = cornerSpeeds(line, points, stepM);
  const flying = backwardPass(forwardPass(caps, stepM, false), stepM);
  const start = forwardPass(caps, stepM, true);
  // The standing start only ever lowers speeds while it accelerates, so every braking point of
  // the flying lap still holds.
  const standing = flying.map((speed, index) => Math.min(speed, start[index]!));
  return { stepM, flying, standing, offsets };
}

/**
 * Seconds to each point from the line, closing with the lap time. The car reaches the line again
 * at the flying lap's speed there, whichever lap it is on.
 */
export function elapsedSeconds(speeds: Float64Array, flying: Float64Array, stepM: number) {
  const n = speeds.length;
  const elapsed = new Float64Array(n + 1);
  for (let index = 0; index < n; index++) {
    const next = index + 1 < n ? speeds[index + 1]! : flying[0]!;
    // Constant acceleration between two points: the mean of the two speeds.
    elapsed[index + 1] = elapsed[index]! + stepM / Math.max((speeds[index]! + next) / 2, 1e-3);
  }
  return elapsed;
}

const round = (value: number) => Number(value.toFixed(PROFILE_DECIMALS));

/** `PROFILE_POINTS` shares of the lap's time, at evenly spaced shares of its distance. */
function timeShares(elapsed: Float64Array): number[] {
  const steps = elapsed.length - 1;
  const total = elapsed[steps]!;
  const shares: number[] = [];
  for (let point = 0; point < PROFILE_POINTS; point++) {
    const at = (point / (PROFILE_POINTS - 1)) * steps;
    const index = Math.min(Math.floor(at), steps - 1);
    const time = elapsed[index]! + (elapsed[index + 1]! - elapsed[index]!) * (at - index);
    shares.push(round(time / total));
  }
  shares[0] = 0;
  shares[PROFILE_POINTS - 1] = 1;
  for (let point = 1; point < PROFILE_POINTS; point++) {
    if (shares[point]! <= shares[point - 1]!) {
      throw new Error('outline: the speed profile is not strictly increasing once rounded');
    }
  }
  return shares;
}

/**
 * The stored racing line: `RACING_LINE_STEP_M` apart round the lap, entry `j` at the share
 * `j / length` of the lap's distance, rounded.
 */
function storedOffsets(offsets: Float64Array, lengthM: number): number[] {
  const n = offsets.length;
  const count = Math.max(4, Math.round(lengthM / RACING_LINE_STEP_M));
  const line: number[] = [];
  for (let entry = 0; entry < count; entry++) {
    const at = (entry * n) / count;
    const index = Math.floor(at);
    const a = offsets[index % n]!;
    const b = offsets[(index + 1) % n]!;
    line.push(Number((a + (b - a) * (at - index)).toFixed(RACING_LINE_DECIMALS)) || 0);
  }
  return line;
}

/** What `circuits:build` stores for a circuit's lap. */
export type LapModel = {
  profile: Required<SpeedProfile>;
  /** The racing line's offsets, metres to the left of travel (see `storedOffsets`). */
  racingLine: number[];
};

/**
 * The speed profile and racing line of a closed outline (`d` in `viewBox` units, `lengthM` metres
 * round, `widthM` wide): the flying lap's time shares, lap 1's from a standing start in `start`,
 * and the line's offsets.
 */
export function lapModelFromOutline(d: string, lengthM: number, widthM: number): LapModel {
  const { stepM, flying, standing, offsets } = outlineSpeeds(d, lengthM, widthM);
  return {
    profile: {
      time: timeShares(elapsedSeconds(flying, flying, stepM)),
      start: timeShares(elapsedSeconds(standing, flying, stepM)),
    },
    racingLine: storedOffsets(offsets, lengthM),
  };
}

/**
 * The speed profile of a closed outline (`d` in `viewBox` units, `lengthM` metres round), along
 * the racing line when `widthM` is given: the flying lap's time shares, and lap 1's from a
 * standing start in `start`.
 */
export function speedProfileFromOutline(
  d: string,
  lengthM: number,
  widthM?: number,
): Required<SpeedProfile> {
  const { stepM, flying, standing } = outlineSpeeds(d, lengthM, widthM);
  return {
    time: timeShares(elapsedSeconds(flying, flying, stepM)),
    start: timeShares(elapsedSeconds(standing, flying, stepM)),
  };
}
