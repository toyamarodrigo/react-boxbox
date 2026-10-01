/**
 * SPIKE (issue #9), throwaway. A quick speed profile for the Onboard view only, so a car slows
 * for corners and still crosses the line at its real lap time. The real one (ADR 0005) is built
 * by `circuits:build` and read by `carLapsAt`; this one does not touch either.
 *
 * The profile is the share of lap time spent up to each sample of the centreline. A car's
 * constant-speed lap fraction is a share of its lap time, so mapping that share back through the
 * profile gives the distance it has covered with the corners slowed down.
 */
import { type Centreline, angleDelta } from './track';

/** Lateral grip, about 3 g: the corner speed is `sqrt(A_LAT / curvature)`. */
const A_LAT = 30;
/** Top speed, about 340 km/h. */
const V_MAX = 95;
/** Acceleration from low speed, fading towards top speed. */
const A_ACCEL = 14;
/** Braking, about 4.5 g. */
const A_BRAKE = 44;
/** Half the window, in samples, the curvature is measured over (about 12 m each way). */
const CURVATURE_HALF_WINDOW = 3;

export type SpeedProfile = {
  /** Same as the centreline's `s`: distance at each sample, closing with the lap length. */
  s: Float64Array;
  /** Share of a flying lap's time spent up to each sample, 0 at the line, 1 back at it. */
  share: Float64Array;
  /** The same for lap 1, from standstill. */
  firstLapShare: Float64Array;
  /** Speed at each sample in m/s, for debugging. Not shown: it is not telemetry. */
  speed: Float64Array;
};

const acceleration = (v: number) => Math.max(0.5, A_ACCEL * (1 - (v / V_MAX) ** 2));

function cornerSpeeds(line: Centreline): Float64Array {
  const n = line.heading.length;
  const caps = new Float64Array(n);
  const k = CURVATURE_HALF_WINDOW;
  const span = (2 * k * line.length) / n;
  for (let index = 0; index < n; index++) {
    const turn = Math.abs(
      angleDelta(line.heading[(index - k + n) % n]!, line.heading[(index + k) % n]!),
    );
    const curvature = turn / span;
    caps[index] = Math.min(V_MAX, Math.sqrt(A_LAT / Math.max(curvature, 1e-9)));
  }
  return caps;
}

const step = (line: Centreline, index: number) => line.s[index + 1]! - line.s[index]!;

/** Acceleration limit forwards from the line; twice round when the lap wraps onto itself. */
function forwardPass(line: Centreline, caps: Float64Array, start?: number): Float64Array {
  const n = caps.length;
  const v = Float64Array.from(caps);
  if (start !== undefined) v[0] = start;
  const rounds = start === undefined ? 2 : 1;
  for (let at = 1; at < n * rounds; at++) {
    const here = at % n;
    const previous = (at - 1) % n;
    const reachable = Math.sqrt(
      v[previous]! ** 2 + 2 * acceleration(v[previous]!) * step(line, previous),
    );
    v[here] = Math.min(v[here]!, reachable);
  }
  return v;
}

/** Braking limit backwards round the lap, twice so the line brakes for the first corner. */
function backwardPass(line: Centreline, v: Float64Array): Float64Array {
  const n = v.length;
  const out = Float64Array.from(v);
  for (let at = 2 * n - 2; at >= 0; at--) {
    const here = at % n;
    const next = (here + 1) % n;
    out[here] = Math.min(out[here]!, Math.sqrt(out[next]! ** 2 + 2 * A_BRAKE * step(line, here)));
  }
  return out;
}

function timeShare(line: Centreline, v: Float64Array): Float64Array {
  const n = v.length;
  const share = new Float64Array(n + 1);
  for (let index = 0; index < n; index++) {
    const average = Math.max(0.5, (v[index]! + v[(index + 1) % n]!) / 2);
    share[index + 1] = share[index]! + step(line, index) / average;
  }
  const total = share[n]!;
  for (let index = 0; index <= n; index++) share[index] = share[index]! / total;
  return share;
}

export function speedProfile(line: Centreline): SpeedProfile {
  const caps = cornerSpeeds(line);
  const speed = backwardPass(line, forwardPass(line, caps));
  // From standstill, then the flying-lap limits wherever they are lower: that keeps the braking
  // for every corner, because the standing start only ever lowers the speed while it accelerates.
  const standing = forwardPass(line, caps, 0);
  const first = speed.map((value, index) => Math.min(value, standing[index]!));
  return { s: line.s, share: timeShare(line, speed), firstLapShare: timeShare(line, first), speed };
}

/** Linear lookup of `ys` at `x` in the increasing `xs`. */
function lookup(xs: Float64Array, ys: Float64Array, x: number): number {
  const last = xs.length - 1;
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[last]!) return ys[last]!;
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (xs[middle]! <= x) low = middle;
    else high = middle;
  }
  const span = xs[high]! - xs[low]!;
  const t = span === 0 ? 0 : (x - xs[low]!) / span;
  return ys[low]! + (ys[high]! - ys[low]!) * t;
}

/**
 * Where a car is after the share `u` (0..1) of the time it takes to drive from `fromM` to `toM`,
 * with the profile's rhythm stretched over that stretch. A whole lap is `0 → length`; an in-lap
 * stops at the pit entry and an out-lap starts at the pit exit, so the car never jumps where it
 * leaves or rejoins the lane.
 */
export function distanceAt(
  profile: SpeedProfile,
  firstLap: boolean,
  fromM: number,
  toM: number,
  u: number,
): number {
  const share = firstLap ? profile.firstLapShare : profile.share;
  const from = lookup(profile.s, share, fromM);
  const to = lookup(profile.s, share, toM);
  const clamped = Math.min(Math.max(u, 0), 1);
  return lookup(share, profile.s, from + (to - from) * clamped);
}
