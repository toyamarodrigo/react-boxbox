/**
 * How a car's body and wheels move as it drives, worked out from the car's own motion frame to
 * frame: no telemetry, only where it was and where it is. Pure numbers, no three.js.
 */

/** The most a wheel turns in one frame, in radians: a full turn, more than any speed needs. */
export const WHEEL_SPIN_MAX = Math.PI * 2;

/**
 * How far a wheel of `radius` metres turns rolling `distance` metres, in radians, clamped to a
 * turn either way so a seek across the circuit does not whirl it. Zero for a wheel of no size.
 */
export function wheelSpin(distance: number, radius: number): number {
  if (!(radius > 0) || !Number.isFinite(distance)) return 0;
  return Math.max(-WHEEL_SPIN_MAX, Math.min(WHEEL_SPIN_MAX, distance / radius));
}

/**
 * The body's roll in a corner: `maxRad` at most, `radPerG` radians for every g of lateral
 * acceleration. A formula car hardly rolls: about half a degree a g, under two degrees in all.
 */
export const ROLL = { radPerG: 0.0075, maxRad: 0.03 } as const;
const GRAVITY = 9.81;

/**
 * How far the body leans in a corner, in radians about the car's length, from how much the
 * heading turned (`headingDelta`, radians; positive turns right) over `distance` metres in
 * `seconds`. The lateral acceleration is the speed squared times the curvature; the body leans
 * to the outside, so a right turn gives a negative roll (the top tips to the left). Zero when
 * the car has not moved or no time has passed.
 */
export function cornerRoll(headingDelta: number, distance: number, seconds: number): number {
  if (!(distance > 0) || !(seconds > 0) || !Number.isFinite(headingDelta)) return 0;
  const curvature = headingDelta / distance;
  const speed = distance / seconds;
  const lateralG = (speed * speed * curvature) / GRAVITY;
  const roll = -lateralG * ROLL.radPerG;
  return Math.max(-ROLL.maxRad, Math.min(ROLL.maxRad, roll));
}

/**
 * The suspension's bob over the road, in metres up, after `travelled` metres: two ripples of a
 * few millimetres that never repeat exactly, so a stationary car sits still and a moving one
 * trembles a little.
 */
export function suspensionBob(travelled: number): number {
  if (!Number.isFinite(travelled)) return 0;
  return 0.003 * Math.sin(travelled * 5.3) + 0.002 * Math.sin(travelled * 1.7 + 1);
}

/**
 * How bright the car's rear light burns, as a multiplier of its usual glow: full under a
 * safety car, a virtual one or a red flag, when the rain light is on, and a dim idle glow else.
 */
export function rearLightLevel(status: string): number {
  return status === 'sc' || status === 'vsc' || status === 'red' ? 1 : 0.25;
}
