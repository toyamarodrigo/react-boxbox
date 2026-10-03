/**
 * The Onboard view's chase camera: where it stands behind the followed car, what it looks at, and
 * its field of view for the canvas's shape. No canvas here, so the framing is tested on its own.
 */
import { MathUtils, type Vector3 } from 'three';
import type { CarPlace } from './car-model';
import type { TrackPoint } from './track';

/**
 * The chase camera, in metres: `distance` behind the car's centre on the track the car drove, so
 * it stays on the track through a corner; `height` over the ground there, a little above the
 * rear wing; aiming `ahead` metres past the car at `aim` over the road, so it looks a little down
 * the track with the whole car in the lower third. `fov` is its vertical field of view in degrees,
 * opened on a narrow canvas until the horizontal one is `minWidthFov`, so the car always fits
 * across. `edge` is how far inside the track's edge it keeps, clear of the kerbs and the walls.
 */
export const CHASE = {
  distance: 6.5,
  height: 1.6,
  ahead: 20,
  aim: 0.25,
  fov: 52,
  minWidthFov: 46,
  edge: 0.5,
} as const;

/** The chase camera's vertical field of view, in degrees, on a canvas `aspect` wide for its height. */
export function chaseFov(aspect: number): number {
  const halfWidth = MathUtils.degToRad(CHASE.minWidthFov / 2);
  return Math.max(CHASE.fov, MathUtils.radToDeg(2 * Math.atan(Math.tan(halfWidth) / aspect)));
}

/**
 * The way the chase camera looks and the ground's rise over run under it: from `back`, where the
 * car was `CHASE.distance` along its track before, to the car. Following the chord of the track
 * keeps the camera on the line the car drove; the car's own heading and pitch where the two are
 * too close to tell apart (a pit lane's first metres, which clamp at its entry).
 */
export function chaseLine(
  car: CarPlace,
  back: { x: number; y: number; z: number },
): { heading: number; slope: number } {
  const run = Math.hypot(car.x - back.x, car.z - back.z);
  if (run < 1) return { heading: car.heading, slope: Math.tan(car.pitch) };
  return { heading: Math.atan2(car.z - back.z, car.x - back.x), slope: (car.y - back.y) / run };
}

/**
 * Sets `position` and `target` for a chase camera looking along `heading` at `car`, over ground
 * rising `slope`: the camera's height is over the ground behind the car, so it climbs and dips
 * with the track and the car stays in the same place on screen. `edge` is the lap's centre abreast
 * of the camera and the half width it keeps within, so on a street circuit it never stands in a
 * wall; a car in the pit lane has none.
 */
export function chaseView(
  car: CarPlace,
  heading: number,
  slope: number,
  position: Vector3,
  target: Vector3,
  edge?: { centre: TrackPoint; half: number },
): void {
  const dx = Math.cos(heading);
  const dz = Math.sin(heading);
  let x = car.x - dx * CHASE.distance;
  let z = car.z - dz * CHASE.distance;
  if (edge) {
    // Metres to the left of the centre's travel, as `sideways` measures them, pulled within reach.
    const { centre, half } = edge;
    const left =
      (x - centre.x) * Math.sin(centre.heading) - (z - centre.z) * Math.cos(centre.heading);
    const inside = Math.min(Math.max(left, -half), half) - left;
    x += Math.sin(centre.heading) * inside;
    z -= Math.cos(centre.heading) * inside;
  }
  position.set(x, car.y - slope * CHASE.distance + CHASE.height, z);
  target.set(
    car.x + dx * CHASE.ahead,
    car.y + CHASE.aim + slope * CHASE.ahead,
    car.z + dz * CHASE.ahead,
  );
}
