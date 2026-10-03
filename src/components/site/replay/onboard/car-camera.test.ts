import { describe, expect, it } from 'vitest';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CAR_LENGTH_M } from '@/data/onboard-frame';
import { CHASE, chaseFov, chaseLine, chaseView } from './car-camera';
import { CAR_HEIGHT_M, CAR_WIDTH_M } from './car-model';

/** The canvas's shapes: a desktop window and a phone's, where the canvas fills the width. */
const CANVASES = { desktop: 1600 / 1000, phone: 390 / 544, tall: 390 / 844 } as const;

/** The horizontal field of view, in degrees, of a vertical one on a canvas `aspect` wide. */
const widthFov = (fov: number, aspect: number) =>
  MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(fov / 2)) * aspect));

/**
 * Where the car's box and its contact shadow's dark patch land on screen, in normalised device
 * coordinates, for a car at the origin pitched `pitch` radians nose up, the ground behind it
 * rising `slope`, on a canvas `aspect` wide.
 */
function framed(aspect: number, pitch = 0, slope = Math.tan(pitch)) {
  const car = { x: 0, y: 0, z: 0, heading: 0, pitch };
  const camera = new PerspectiveCamera(chaseFov(aspect), aspect, 0.25, 1000);
  const target = new Vector3();
  chaseView(car, 0, slope, camera.position, target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const half = CAR_LENGTH_M / 2;
  const points: Vector3[] = [];
  for (const x of [-half, half]) {
    for (const z of [-CAR_WIDTH_M / 2, CAR_WIDTH_M / 2]) {
      points.push(new Vector3(x, 0, z), new Vector3(x, CAR_HEIGHT_M, z));
    }
  }
  for (const z of [-1.1, 1.1]) points.push(new Vector3(-3, 0, z), new Vector3(2.6, 0, z));
  return points.map((point) => point.applyAxisAngle(new Vector3(0, 0, 1), pitch).project(camera));
}

describe('chaseFov', () => {
  it('keeps the vertical field of view on a wide canvas and opens it on a narrow one', () => {
    expect(chaseFov(CANVASES.desktop)).toBe(CHASE.fov);
    for (const aspect of [CANVASES.phone, CANVASES.tall]) {
      expect(chaseFov(aspect)).toBeGreaterThan(CHASE.fov);
      expect(widthFov(chaseFov(aspect), aspect)).toBeCloseTo(CHASE.minWidthFov, 6);
    }
  });
});

describe('chaseView', () => {
  it('stands behind the car a little above its rear wing, looking a little down the track', () => {
    const position = new Vector3();
    const target = new Vector3();
    chaseView({ x: 10, y: 5, z: 0, heading: 0, pitch: 0 }, 0, 0, position, target);
    expect(position.toArray()).toEqual([10 - CHASE.distance, 5 + CHASE.height, 0]);
    expect(target.x).toBe(10 + CHASE.ahead);
    expect(target.y).toBeLessThan(position.y);
    expect(target.y).toBeGreaterThan(5);
  });

  it('shows the whole car and its shadow in the lower half on every canvas', () => {
    for (const [name, aspect] of Object.entries(CANVASES)) {
      for (const pitch of [0, 0.17, -0.12]) {
        const points = framed(aspect, pitch);
        for (const point of points) {
          expect(Math.abs(point.x), `${name} ${pitch}`).toBeLessThan(0.95);
          expect(point.y, `${name} ${pitch}`).toBeGreaterThan(-0.98);
          expect(point.y, `${name} ${pitch}`).toBeLessThan(0);
        }
      }
    }
  });

  it('fills a good share of a desktop canvas with the car, no small icon', () => {
    const heights = framed(CANVASES.desktop).map((point) => point.y);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.6);
  });

  it('keeps the car in place on screen up a steep climb from a dip', () => {
    // Eau Rouge: the car already climbs while the ground behind it is still in the dip.
    const flat = framed(CANVASES.desktop);
    const climb = framed(CANVASES.desktop, 0.17, 0.09);
    for (const [index, point] of climb.entries()) {
      expect(point.y).toBeGreaterThan(-0.98);
      expect(Math.abs(point.y - flat[index]!.y)).toBeLessThan(0.2);
    }
  });

  it('stays inside the track’s edges', () => {
    const position = new Vector3();
    const target = new Vector3();
    const centre = { x: 0, y: 0, z: 0, heading: 0 };
    // Looking 45° across a track running along x: the camera would stand 4.6 m off its centre.
    const car = { x: 0, y: 0, z: 0, heading: Math.PI / 4, pitch: 0 };
    chaseView(car, car.heading, 0, position, target, { centre, half: 3 });
    expect(Math.abs(position.z)).toBeCloseTo(3, 6);
    expect(position.x).toBeCloseTo(-CHASE.distance * Math.SQRT1_2, 6);
    chaseView(car, car.heading, 0, position, target, { centre, half: 6 });
    expect(position.z).toBeCloseTo(-CHASE.distance * Math.SQRT1_2, 6);
  });
});

describe('chaseLine', () => {
  it('looks along the track the car drove, so the camera stands on it through a hairpin', () => {
    // A hairpin of 12 m radius round the origin, driven anticlockwise as seen from above.
    const radius = 12;
    const at = (angle: number) => ({
      x: radius * Math.cos(angle),
      y: 0,
      z: radius * Math.sin(angle),
      heading: angle + Math.PI / 2,
      pitch: 0,
    });
    const car = at(1);
    const line = chaseLine(car, at(1 - CHASE.distance / radius));
    const position = new Vector3();
    chaseView(car, line.heading, line.slope, position, new Vector3());
    expect(Math.hypot(position.x, position.z)).toBeCloseTo(radius, 0);
    expect(line.slope).toBe(0);
  });

  it('climbs with the ground between the camera and the car', () => {
    const car = { x: 0, y: 1, z: 0, heading: 0, pitch: 0.2 };
    expect(chaseLine(car, { x: -10, y: 0, z: 0 })).toEqual({ heading: 0, slope: 0.1 });
  });

  it('falls back on the car’s heading and pitch where the track behind it clamps', () => {
    const car = { x: 3, y: 0, z: 4, heading: 0.4, pitch: 0.05 };
    expect(chaseLine(car, { x: 3, y: 0, z: 4.2 })).toEqual({
      heading: 0.4,
      slope: Math.tan(0.05),
    });
  });
});
