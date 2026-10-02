/**
 * The Onboard view's car: a generic modern formula car built from simple shapes in code, so it
 * ships no asset and copies no real car, livery, logo or number. Its bodywork takes the team
 * colour; the floor, wings' main planes, halo, tyres and other carbon parts are dark.
 *
 * Two levels of detail share the same two materials: the near one with rounded bodywork, the
 * halo, the driver's helmet and the suspension, and a far one of plain boxes and coarse wheels
 * for cars more than `CAR_LOD_SWITCH_M` from the camera.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LOD,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_LENGTH_M } from '@/data/onboard-frame';

/** The car's overall width, across the tyres, and its height, at the top of the airbox, in metres. */
export const CAR_WIDTH_M = 1.9;
export const CAR_HEIGHT_M = 0.95;

/** How far from the camera, in metres, a car switches to its far level of detail. */
export const CAR_LOD_SWITCH_M = 70;

/** The group of each part's material in the car's geometries: bodywork, then carbon. */
export const CAR_MATERIAL = { body: 0, carbon: 1 } as const;

const CARBON_COLOUR = '#17181b';

/** A cross-section of a loft: at `x` along the car, centred `z` across it, `y` from `bottom` to `top`. */
export type LoftStation = { x: number; z?: number; halfWidth: number; bottom: number; top: number };

/**
 * A ring of points round a station: a rounded box (a superellipse) with `sides` points, or a
 * plain box with four.
 */
function ring({ x, z = 0, halfWidth, bottom, top }: LoftStation, sides: number): Vector3[] {
  const middle = (top + bottom) / 2;
  const halfHeight = (top - bottom) / 2;
  const box = sides === 4;
  const points: Vector3[] = [];
  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2 + (box ? Math.PI / 4 : 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // A superellipse of exponent 3: a box with well-rounded corners.
    const bend = box ? 0 : 2 / 3;
    points.push(
      new Vector3(
        x,
        middle + Math.sign(sin) * Math.abs(sin) ** bend * halfHeight,
        z + Math.sign(cos) * Math.abs(cos) ** bend * halfWidth,
      ),
    );
  }
  return points;
}

/** A flat cap closing `points`, facing `+x` when `front`, `-x` otherwise. */
function cap(points: Vector3[], front: boolean): BufferGeometry {
  const centre = points
    .reduce((sum, point) => sum.add(point), new Vector3())
    .divideScalar(points.length);
  const positions: number[] = [];
  for (const [index, point] of points.entries()) {
    const next = points[(index + 1) % points.length]!;
    // Round the ring the fan faces -x; the front cap turns it round.
    const [b, c] = front ? [next, point] : [point, next];
    positions.push(...centre.toArray(), ...b.toArray(), ...c.toArray());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A smooth tube through `stations`, front (greatest `x`) to back, with its front and back caps
 * apart so they can take another material. Its normals are smooth round and along the tube.
 */
export function loft(
  stations: readonly LoftStation[],
  sides: number,
): { tube: BufferGeometry; front: BufferGeometry; back: BufferGeometry } {
  const rings = stations.map((station) => ring(station, sides));
  const positions = rings.flatMap((points) => points.flatMap((point) => point.toArray()));
  const indices: number[] = [];
  for (let station = 0; station + 1 < rings.length; station++) {
    for (let side = 0; side < sides; side++) {
      const a = station * sides + side;
      const b = station * sides + ((side + 1) % sides);
      const c = b + sides;
      const d = a + sides;
      // With the stations running to -x, a b c faces out of the tube.
      indices.push(a, b, c, a, c, d);
    }
  }
  const tube = new BufferGeometry();
  tube.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  tube.setIndex(indices);
  tube.computeVertexNormals();
  return { tube, front: cap(rings[0]!, true), back: cap(rings.at(-1)!, false) };
}

/** A box of `size` (length, height, width) at `centre`, pitched `pitch` radians nose up. */
function box(size: [number, number, number], centre: [number, number, number], pitch = 0) {
  const geometry = new BoxGeometry(...size);
  if (pitch) geometry.rotateZ(pitch);
  return geometry.translate(...centre);
}

/** A wheel of `radius` and `width` at `centre`, its axle across the car. */
function wheel(radius: number, width: number, centre: [number, number, number], segments: number) {
  return new CylinderGeometry(radius, radius, width, segments)
    .rotateX(Math.PI / 2)
    .translate(...centre);
}

/** A part at `z` and its mirror image at `-z`. */
const bothSides = (make: (side: 1 | -1) => BufferGeometry) => [make(1), make(-1)];

const HALF_LENGTH = CAR_LENGTH_M / 2;
const HALF_WIDTH = CAR_WIDTH_M / 2;
const WHEEL_RADIUS = 0.36;
const AXLE = { front: 1.75, rear: -1.85 } as const;
const TYRE_WIDTH = { front: 0.3, rear: 0.4 } as const;

/** The nose and the monocoque, tip to the back of the cockpit. */
const CHASSIS: LoftStation[] = [
  { x: 2.76, halfWidth: 0.06, bottom: 0.13, top: 0.24 },
  { x: 2.4, halfWidth: 0.11, bottom: 0.15, top: 0.36 },
  { x: 1.9, halfWidth: 0.16, bottom: 0.19, top: 0.48 },
  { x: 1.4, halfWidth: 0.22, bottom: 0.2, top: 0.58 },
  { x: 0.9, halfWidth: 0.3, bottom: 0.12, top: 0.64 },
  { x: 0.5, halfWidth: 0.36, bottom: 0.08, top: 0.66 },
  { x: -0.4, halfWidth: 0.4, bottom: 0.08, top: 0.66 },
];

/** The airbox and engine cover, from behind the driver's head to the gearbox. */
const ENGINE_COVER: LoftStation[] = [
  { x: -0.22, halfWidth: 0.28, bottom: 0.12, top: CAR_HEIGHT_M },
  { x: -0.7, halfWidth: 0.34, bottom: 0.12, top: 0.88 },
  { x: -1.3, halfWidth: 0.3, bottom: 0.12, top: 0.7 },
  { x: -1.9, halfWidth: 0.18, bottom: 0.15, top: 0.52 },
  { x: -2.35, halfWidth: 0.08, bottom: 0.2, top: 0.42 },
];

/** A sidepod on the `side` of the car, from its intake, narrowing and dropping to the rear. */
const sidepod = (side: 1 | -1): LoftStation[] => [
  { x: 0.75, z: side * 0.6, halfWidth: 0.17, bottom: 0.12, top: 0.5 },
  { x: 0.4, z: side * 0.6, halfWidth: 0.19, bottom: 0.1, top: 0.52 },
  { x: -0.4, z: side * 0.55, halfWidth: 0.18, bottom: 0.1, top: 0.45 },
  { x: -1.1, z: side * 0.42, halfWidth: 0.12, bottom: 0.1, top: 0.3 },
  { x: -1.5, z: side * 0.3, halfWidth: 0.06, bottom: 0.12, top: 0.22 },
];

/** The floor's plan, half of it, from the front, as (x, z): it necks in before the rear tyres. */
const FLOOR_PLAN: [number, number][] = [
  [1.3, 0.3],
  [0.9, 0.8],
  [-1.3, 0.8],
  [-1.55, 0.55],
  [-2.3, 0.5],
];

/** The floor, a thin plate just off the ground. */
function floor(): BufferGeometry {
  const outline = [
    ...FLOOR_PLAN.map(([x, z]) => new Vector2(x, z)),
    ...[...FLOOR_PLAN].reverse().map(([x, z]) => new Vector2(x, -z)),
  ];
  // The shape's y is the car's z; the extrusion, turned down, is the floor's thickness.
  return new ExtrudeGeometry(new Shape(outline), { depth: 0.03, bevelEnabled: false })
    .rotateX(Math.PI / 2)
    .translate(0, 0.06, 0);
}

/** The halo: its centre pillar from the chassis and its hoop round the cockpit. */
function halo(): BufferGeometry[] {
  const hoop = new CatmullRomCurve3(
    [
      [-0.45, 0.68, 0.3],
      [-0.3, 0.85, 0.3],
      [0.08, 0.89, 0.24],
      [0.32, 0.89, 0],
      [0.08, 0.89, -0.24],
      [-0.3, 0.85, -0.3],
      [-0.45, 0.68, -0.3],
    ].map(([x, y, z]) => new Vector3(x, y, z)),
  );
  const pillar = new CatmullRomCurve3(
    [
      [0.62, 0.64, 0],
      [0.46, 0.82, 0],
      [0.3, 0.89, 0],
    ].map(([x, y, z]) => new Vector3(x, y, z)),
  );
  return [new TubeGeometry(hoop, 24, 0.028, 6), new TubeGeometry(pillar, 8, 0.03, 6)];
}

/** The parts of one level of detail, by material. */
type Parts = { body: BufferGeometry[]; carbon: BufferGeometry[] };

/** Bodywork, wings and wheels, at `sides` points round the lofts and `segments` round the wheels. */
function commonParts(sides: number, segments: number): Parts {
  const chassis = loft(CHASSIS, sides);
  const cover = loft(ENGINE_COVER, sides);
  const pods = [loft(sidepod(1), sides), loft(sidepod(-1), sides)];
  const wheels = [
    ...bothSides((side) =>
      wheel(
        WHEEL_RADIUS,
        TYRE_WIDTH.front,
        [AXLE.front, WHEEL_RADIUS, side * (HALF_WIDTH - TYRE_WIDTH.front / 2)],
        segments,
      ),
    ),
    ...bothSides((side) =>
      wheel(
        WHEEL_RADIUS,
        TYRE_WIDTH.rear,
        [AXLE.rear, WHEEL_RADIUS, side * (HALF_WIDTH - TYRE_WIDTH.rear / 2)],
        segments,
      ),
    ),
  ];
  return {
    body: [
      chassis.tube,
      chassis.front,
      chassis.back,
      cover.tube,
      cover.back,
      ...pods.flatMap((pod) => [pod.tube, pod.back]),
      // The front wing's endplates, at the very front, and the rear wing's, at the very back.
      ...bothSides((side) => box([0.5, 0.25, 0.02], [HALF_LENGTH - 0.25, 0.16, side * 0.9])),
      ...bothSides((side) => box([0.55, 0.62, 0.02], [-HALF_LENGTH + 0.275, 0.62, side * 0.5])),
    ],
    carbon: [
      // The airbox intake behind the driver's head, and the sidepods' intakes.
      cover.front,
      ...pods.map((pod) => pod.front),
      // The cockpit opening.
      box([0.85, 0.02, 0.5], [-0.05, 0.665, 0]),
      floor(),
      // The front wing's main plane and the rear wing's.
      box([0.42, 0.025, 1.8], [2.58, 0.09, 0], -0.06),
      box([0.36, 0.03, 0.98], [-2.47, 0.78, 0], -0.15),
      ...wheels,
    ],
  };
}

/** The near level of detail's extra parts: flaps, halo, helmet, suspension, mirrors, diffuser. */
function detailParts(): Parts {
  // A wishbone or track rod: a thin bar from the chassis at `inner` across to the wheel.
  const arm = (x: number, y: number, inner: number, outer: number, side: 1 | -1) =>
    box([0.05, 0.02, outer - inner], [x, y, side * ((inner + outer) / 2)]);
  return {
    body: [
      // The front wing's flaps and the rear wing's top flap.
      box([0.22, 0.02, 1.6], [2.47, 0.16, 0], -0.35),
      box([0.18, 0.018, 1.5], [2.39, 0.23, 0], -0.6),
      box([0.2, 0.025, 0.98], [-2.66, 0.88, 0], -0.45),
      // Mirrors on short stalks.
      ...bothSides((side) => box([0.05, 0.06, 0.14], [0.55, 0.74, side * 0.52])),
    ],
    carbon: [
      ...halo(),
      new SphereGeometry(0.12, 12, 8).translate(-0.02, 0.74, 0),
      ...bothSides((side) => box([0.03, 0.2, 0.02], [0.55, 0.62, side * 0.44])),
      ...bothSides((side) => arm(AXLE.front, 0.5, 0.18, HALF_WIDTH - TYRE_WIDTH.front, side)),
      ...bothSides((side) => arm(AXLE.front, 0.26, 0.15, HALF_WIDTH - TYRE_WIDTH.front, side)),
      ...bothSides((side) => arm(AXLE.rear, 0.48, 0.18, HALF_WIDTH - TYRE_WIDTH.rear, side)),
      ...bothSides((side) => arm(AXLE.rear, 0.24, 0.2, HALF_WIDTH - TYRE_WIDTH.rear, side)),
      // The diffuser, rising to the back, the beam wing and the rear wing's pylon.
      box([0.6, 0.02, 1.0], [-2.1, 0.13, 0], -0.35),
      box([0.2, 0.02, 0.9], [-2.55, 0.38, 0], -0.1),
      box([0.08, 0.42, 0.03], [-2.45, 0.56, 0]),
    ],
  };
}

/** Parts merged into one geometry of positions and normals only. */
function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const plain = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part;
    flat.deleteAttribute('uv');
    return flat;
  });
  const merged = mergeGeometries(plain);
  if (!merged) throw new Error('The car parts did not merge.');
  return merged;
}

/** One level of detail: its parts in two groups, the bodywork and the carbon (`CAR_MATERIAL`). */
function level(parts: Parts): BufferGeometry {
  const merged = mergeGeometries([mergeParts(parts.body), mergeParts(parts.carbon)], true);
  if (!merged) throw new Error('The car levels did not merge.');
  merged.computeBoundingSphere();
  return merged;
}

let geometries: { near: BufferGeometry; far: BufferGeometry } | undefined;

/** The car's two levels of detail, made once and shared by every car. */
export function carGeometries(): { near: BufferGeometry; far: BufferGeometry } {
  if (!geometries) {
    const near = commonParts(16, 24);
    const detail = detailParts();
    geometries = {
      near: level({
        body: [...near.body, ...detail.body],
        carbon: [...near.carbon, ...detail.carbon],
      }),
      far: level(commonParts(4, 8)),
    };
  }
  return geometries;
}

/** One car in `colour`, as a `LOD`, and its two materials, transparent so it can be a ghost. */
export function carObject(colour: string): { object: LOD; materials: MeshStandardMaterial[] } {
  const { near, far } = carGeometries();
  const materials = [
    new MeshStandardMaterial({ color: colour, roughness: 0.4, metalness: 0.15, transparent: true }),
    new MeshStandardMaterial({
      color: CARBON_COLOUR,
      roughness: 0.65,
      metalness: 0.05,
      transparent: true,
    }),
  ];
  const object = new LOD();
  object.addLevel(new Mesh(near, materials), 0);
  object.addLevel(new Mesh(far, materials), CAR_LOD_SWITCH_M, 0.1);
  return { object, materials };
}
