/**
 * How fast a car is taken to be at each point of a lap (ADR 0005). The Replay only knows when a
 * car crossed the line, so the profile never says how fast a car went: it says how a lap's real
 * time is shared out along the lap, slower where the circuit is tight, faster where it is open.
 * Stretched over the time a car took, it decides where the car is between two line crossings.
 *
 * Everything here is pure, so the Track Map, the Timing Tower and the Onboard view can all read
 * a car's place through it and never disagree. It is an approximation, never telemetry.
 */

/**
 * The share of a lap's time a car has used by each of a set of evenly spaced points along the
 * lap. `time[i]` is read at the share `i / (time.length - 1)` of the lap's distance: it starts
 * at 0 on the line, ends at 1 back on it, and increases in between.
 */
export type SpeedProfile = { readonly time: readonly number[] };

/** The same speed all the way round: every share of the lap's time covers the same distance. */
export const CONSTANT_SPEED: SpeedProfile = { time: [0, 1] };

/**
 * A part of the lap the profile is laid over, as shares of the lap's distance. A whole lap runs
 * from 0 to 1; an in-lap ends at the pit entry and an out-lap starts at the pit exit, so the car
 * keeps the profile's rhythm on the track and never jumps where it leaves or rejoins the lane.
 */
export type LapStretch = { readonly from: number; readonly to: number };

/** The whole lap, line to line. */
export const WHOLE_LAP: LapStretch = { from: 0, to: 1 };

const clampShare = (share: number) => Math.min(Math.max(share, 0), 1);

/** The share of the lap's time used by `distance` (a share of the lap's distance). */
function lapTimeAt(profile: SpeedProfile, distance: number): number {
  const { time } = profile;
  const steps = time.length - 1;
  const at = clampShare(distance) * steps;
  const index = Math.min(Math.floor(at), steps - 1);
  return time[index]! + (time[index + 1]! - time[index]!) * (at - index);
}

/** The share of the lap's distance covered by `share` of the lap's time: `lapTimeAt` inverted. */
function lapDistanceAt(profile: SpeedProfile, share: number): number {
  const { time } = profile;
  const steps = time.length - 1;
  const target = clampShare(share);
  let low = 0;
  let high = steps;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (time[middle]! <= target) low = middle;
    else high = middle;
  }
  const span = time[high]! - time[low]!;
  return (low + (span === 0 ? 0 : (target - time[low]!) / span)) / steps;
}

/**
 * Where a car is, as a share of the lap's distance, once it has used `time` (0 to 1) of the time
 * it takes over `stretch`. The profile's shape between the stretch's two ends is stretched to
 * that time, so the car is at `from` at 0 and at `to` at 1 whatever the profile says. With the
 * constant profile it is plain proportion.
 */
export function distanceAt(profile: SpeedProfile, stretch: LapStretch, time: number): number {
  const start = lapTimeAt(profile, stretch.from);
  const end = lapTimeAt(profile, stretch.to);
  return lapDistanceAt(profile, start + (end - start) * time);
}

/**
 * The share of the time it takes over `stretch` a car has used when it reaches `distance` (a
 * share of the lap's distance, inside the stretch): `distanceAt` inverted.
 */
export function timeShareAt(profile: SpeedProfile, stretch: LapStretch, distance: number): number {
  const start = lapTimeAt(profile, stretch.from);
  const end = lapTimeAt(profile, stretch.to);
  return end === start ? 0 : (lapTimeAt(profile, distance) - start) / (end - start);
}

/**
 * Whether the profile is the same speed all the way round. Two points are only ever the line
 * and the line again, so a profile of two is constant whatever made it.
 */
export function isConstantSpeed(profile: SpeedProfile): boolean {
  return profile.time.length <= 2;
}
