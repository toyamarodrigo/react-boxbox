/**
 * The parts of the Onboard view's car, sculpted in code from `car-shapes`: a generic modern
 * formula car that ships no asset and copies no real car, livery, logo or number. Each part
 * belongs to one material; the near level of detail and the far one are built from the same
 * dimensions.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  LatheGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { CAR_LENGTH_M } from '@/data/onboard-frame';
import { type LoftStation, type WingStation, loft, mirrored, plate, rod, wing } from './car-shapes';

/** The car's overall width, across the tyres, and its height, at the top of the airbox, in metres. */
export const CAR_WIDTH_M = 1.9;
export const CAR_HEIGHT_M = 0.95;

/** The car's materials, in the order of its geometries' groups. */
export const CAR_MATERIAL = { paint: 0, carbon: 1, metal: 2, rubber: 3, light: 4 } as const;
export type CarMaterialName = keyof typeof CAR_MATERIAL;

/** The parts of one level of detail, by material. */
export type Parts = Partial<Record<CarMaterialName, BufferGeometry[]>>;

export const WHEEL_RADIUS = 0.36;
const RIM_RADIUS = 0.235;
export const AXLE = { front: 1.75, rear: -1.85 } as const;
export const TYRE_WIDTH = { front: 0.3, rear: 0.4 } as const;
const HALF_WIDTH = CAR_WIDTH_M / 2;
/** Where each wheel's centre is (along, across): front left, front right, rear left, rear right. */
export const WHEEL_CENTRES: readonly [number, number][] = [
  [AXLE.front, -(HALF_WIDTH - TYRE_WIDTH.front / 2)],
  [AXLE.front, HALF_WIDTH - TYRE_WIDTH.front / 2],
  [AXLE.rear, -(HALF_WIDTH - TYRE_WIDTH.rear / 2)],
  [AXLE.rear, HALF_WIDTH - TYRE_WIDTH.rear / 2],
];
const HALF_LENGTH = CAR_LENGTH_M / 2;

/** A box of `size` (length, height, width) at `centre`, pitched `pitch` radians nose up. */
function box(size: [number, number, number], centre: [number, number, number], pitch = 0) {
  const geometry = new BoxGeometry(...size);
  if (pitch) geometry.rotateZ(pitch);
  return geometry.translate(...centre);
}

/** A part at `z` and its mirror image at `-z`. */
const bothSides = <T>(make: (side: 1 | -1) => T) => [make(1), make(-1)];

/** The nose and the monocoque, tip to behind the cockpit; the tip rides over the front wing. */
const CHASSIS: LoftStation[] = [
  { x: 2.76, halfWidth: 0.04, bottom: 0.17, top: 0.25, bend: 0.9 },
  { x: 2.5, halfWidth: 0.09, bottom: 0.17, top: 0.34, bend: 0.85 },
  { x: 2.1, halfWidth: 0.14, bottom: 0.2, top: 0.43, bend: 0.8 },
  { x: 1.7, halfWidth: 0.19, bottom: 0.21, top: 0.52, bend: 0.75 },
  { x: 1.3, halfWidth: 0.24, bottom: 0.17, top: 0.58, bend: 0.7 },
  { x: 0.95, halfWidth: 0.3, bottom: 0.1, top: 0.62, bend: 0.6 },
  { x: 0.6, halfWidth: 0.36, bottom: 0.08, top: 0.64, bend: 0.55 },
  { x: 0.0, halfWidth: 0.4, bottom: 0.08, top: 0.63, bend: 0.55 },
  { x: -0.45, halfWidth: 0.4, bottom: 0.08, top: 0.62, bend: 0.55 },
  { x: -0.75, halfWidth: 0.37, bottom: 0.08, top: 0.6, bend: 0.55 },
];

/** The airbox over the driver's head and the engine cover, down to the rear crash structure. */
const ENGINE_COVER: LoftStation[] = [
  { x: -0.2, halfWidth: 0.16, bottom: 0.64, top: CAR_HEIGHT_M, bend: 0.8 },
  { x: -0.5, halfWidth: 0.29, bottom: 0.3, top: 0.93, bend: 0.7 },
  { x: -0.9, halfWidth: 0.34, bottom: 0.14, top: 0.84, bend: 0.65 },
  { x: -1.4, halfWidth: 0.3, bottom: 0.12, top: 0.68, bend: 0.65 },
  { x: -1.9, halfWidth: 0.2, bottom: 0.14, top: 0.5, bend: 0.7 },
  { x: -2.3, halfWidth: 0.1, bottom: 0.2, top: 0.4, bend: 0.8 },
  { x: -2.7, halfWidth: 0.06, bottom: 0.24, top: 0.34, bend: 0.9 },
];

/** A sidepod on `side`: a high narrow inlet, a deep undercut, ramping down to the floor at the rear. */
const sidepod = (side: 1 | -1): LoftStation[] => [
  { x: 0.75, z: side * 0.56, halfWidth: 0.14, bottom: 0.3, top: 0.56, bend: 0.6 },
  { x: 0.5, z: side * 0.58, halfWidth: 0.2, bottom: 0.24, top: 0.58, bend: 0.6 },
  { x: 0.0, z: side * 0.56, halfWidth: 0.22, bottom: 0.2, top: 0.56, bend: 0.6 },
  { x: -0.6, z: side * 0.5, halfWidth: 0.2, bottom: 0.14, top: 0.5, bend: 0.6 },
  { x: -1.2, z: side * 0.4, halfWidth: 0.15, bottom: 0.1, top: 0.36, bend: 0.65 },
  { x: -1.6, z: side * 0.3, halfWidth: 0.08, bottom: 0.1, top: 0.22, bend: 0.8 },
];

/** The headrest and cockpit surround behind the driver's helmet. */
const HEADREST: LoftStation[] = [
  { x: -0.15, halfWidth: 0.3, bottom: 0.6, top: 0.72, bend: 0.5 },
  { x: -0.55, halfWidth: 0.32, bottom: 0.6, top: 0.74, bend: 0.5 },
];

/** The diffuser: a channel rising from the floor to the back, closed over; the strakes stand in it. */
const DIFFUSER: LoftStation[] = [
  { x: -1.5, halfWidth: 0.5, bottom: 0.045, top: 0.1 },
  { x: -2.0, halfWidth: 0.5, bottom: 0.07, top: 0.13 },
  { x: -2.6, halfWidth: 0.46, bottom: 0.3, top: 0.36 },
];

/** The floor's plan, half of it, from the front, as (x, z): it necks in before the rear tyres. */
const FLOOR_PLAN: [number, number][] = [
  [1.35, 0.3],
  [1.1, 0.62],
  [0.85, 0.8],
  [-1.1, 0.8],
  [-1.45, 0.58],
  [-2.35, 0.5],
];

/** The floor, a plate just off the ground with a rounded edge. */
function floor(round: boolean): BufferGeometry {
  const outline: [number, number][] = [
    ...FLOOR_PLAN,
    ...[...FLOOR_PLAN].reverse().map(([x, z]): [number, number] => [x, -z]),
  ];
  // Drawn in the car's x and z, the plate's thickness along y.
  return plate(outline, round ? 0.08 : 0, 0, 0.025)
    .rotateX(Math.PI / 2)
    .translate(0, 0.055, 0);
}

const FRONT_WING = { thickness: 0.1, camber: -0.06 } as const;
const REAR_WING = { thickness: 0.11, camber: -0.05 } as const;

/** The front wing: a main plane under the nose to the tips, and three flaps behind it either side. */
function frontWing(): BufferGeometry[] {
  const main = wing(
    mirrored([
      { z: 0, x: 2.78, y: 0.09, chord: 0.36, angle: 0.08 },
      { z: 0.45, x: 2.79, y: 0.1, chord: 0.36, angle: 0.1 },
      { z: 0.88, x: 2.8, y: 0.14, chord: 0.3, angle: 0.12 },
    ]),
    FRONT_WING,
  );
  const flap = (x: number, y: number, chord: number, angle: number, inner: number) =>
    bothSides((side) =>
      wing(
        [
          { z: side * inner, x, y, chord, angle },
          { z: side * 0.55, x, y: y + 0.005, chord, angle },
          { z: side * 0.86, x: x + 0.02, y: y + 0.03, chord: chord * 0.85, angle },
        ].sort((a, b) => a.z - b.z),
        FRONT_WING,
      ),
    ).flat();
  return [
    ...main,
    ...flap(2.5, 0.16, 0.22, 0.3, 0.2),
    ...flap(2.4, 0.23, 0.17, 0.5, 0.22),
    ...flap(2.32, 0.29, 0.13, 0.65, 0.24),
  ];
}

/** The rear wing's main plane and its flap, both spanning between the endplates. */
function rearWing(): BufferGeometry[] {
  const span = (x: number, y: number, chord: number, angle: number): WingStation[] =>
    [-0.47, 0, 0.47].map((z) => ({ z, x, y, chord, angle }));
  return [
    ...wing(span(-2.4, 0.7, 0.32, -0.15), REAR_WING),
    ...wing(span(-2.56, 0.78, 0.2, -0.55), REAR_WING),
  ];
}

/** The beam wing's two elements, under the rear wing between the diffuser and the endplates. */
function beamWing(): BufferGeometry[] {
  const span = (x: number, y: number, chord: number, angle: number): WingStation[] =>
    [-0.42, 0, 0.42].map((z) => ({ z, x, y, chord, angle }));
  return [
    ...wing(span(-2.5, 0.41, 0.14, -0.3), REAR_WING),
    ...wing(span(-2.6, 0.49, 0.12, -0.5), REAR_WING),
  ];
}

/** The halo: its hoop round the cockpit and the pillar from the chassis in front of the driver. */
function halo(): BufferGeometry[] {
  const hoop = new CatmullRomCurve3(
    [
      [-0.5, 0.66, 0.32],
      [-0.3, 0.86, 0.31],
      [0.1, 0.9, 0.25],
      [0.36, 0.9, 0],
      [0.1, 0.9, -0.25],
      [-0.3, 0.86, -0.31],
      [-0.5, 0.66, -0.32],
    ].map(([x, y, z]) => new Vector3(x, y, z)),
  );
  const pillar = new CatmullRomCurve3(
    [
      [0.68, 0.62, 0],
      [0.5, 0.82, 0],
      [0.34, 0.9, 0],
    ].map(([x, y, z]) => new Vector3(x, y, z)),
  );
  return [new TubeGeometry(hoop, 32, 0.034, 8), new TubeGeometry(pillar, 8, 0.03, 8)];
}

/** The suspension's wishbones and the push or pull rod at each corner. */
function suspension(): BufferGeometry[] {
  const arm = 0.012;
  const front = (s: 1 | -1): BufferGeometry[] => [
    rod([1.95, 0.5, s * 0.18], [AXLE.front, 0.5, s * 0.7], arm),
    rod([1.55, 0.48, s * 0.2], [AXLE.front, 0.5, s * 0.7], arm),
    rod([1.95, 0.2, s * 0.2], [AXLE.front, 0.2, s * 0.7], arm),
    rod([1.55, 0.19, s * 0.22], [AXLE.front, 0.2, s * 0.7], arm),
    rod([1.72, 0.22, s * 0.66], [1.6, 0.56, s * 0.24], 0.01),
  ];
  const rear = (s: 1 | -1): BufferGeometry[] => [
    rod([-1.6, 0.48, s * 0.18], [AXLE.rear, 0.5, s * 0.6], arm),
    rod([-2.1, 0.46, s * 0.14], [AXLE.rear, 0.5, s * 0.6], arm),
    rod([-1.6, 0.16, s * 0.3], [AXLE.rear, 0.2, s * 0.6], arm),
    rod([-2.15, 0.18, s * 0.24], [AXLE.rear, 0.2, s * 0.6], arm),
    rod([AXLE.rear, 0.5, s * 0.56], [-1.75, 0.22, s * 0.2], 0.01),
  ];
  return [...bothSides(front).flat(), ...bothSides(rear).flat()];
}

/** The front wing's endplates, the rear wing's and the shark fin, painted plates. */
function paintedPlates(): BufferGeometry[] {
  return [
    ...bothSides((s) =>
      plate(
        [
          [HALF_LENGTH, 0.1],
          [2.32, 0.07],
          [2.2, 0.14],
          [2.24, 0.34],
          [2.6, 0.32],
          [HALF_LENGTH, 0.22],
        ],
        0.03,
        s * 0.9,
        0.012,
      ),
    ),
    ...bothSides((s) =>
      plate(
        [
          [-2.2, 0.48],
          [-2.68, 0.44],
          [-HALF_LENGTH, 0.58],
          [-2.78, 0.9],
          [-2.5, 0.93],
          [-2.25, 0.72],
        ],
        0.04,
        s * 0.485,
        0.012,
      ),
    ),
    plate(
      [
        [-0.6, 0.9],
        [-1.0, 0.8],
        [-1.5, 0.63],
        [-2.2, 0.43],
        [-2.2, 0.52],
        [-1.5, 0.72],
        [-1.0, 0.88],
        [-0.6, 0.94],
      ],
      0.01,
      0,
      0.012,
    ),
  ];
}

/** The rear wing's swan-neck pylons and the diffuser's strakes, carbon plates. */
function carbonPlates(): BufferGeometry[] {
  return [
    ...bothSides((s) =>
      plate(
        [
          [-2.2, 0.4],
          [-2.45, 0.4],
          [-2.56, 0.76],
          [-2.42, 0.78],
        ],
        0.01,
        s * 0.12,
        0.012,
      ),
    ),
    ...bothSides((s) =>
      [0.16, 0.3, 0.43].map((z) => box([0.7, 0.08, 0.008], [-2.1, 0.17, s * z], 0.3)),
    ).flat(),
  ];
}

/** The driver's helmet, with its visor, and the mirrors on their stalks. */
function cockpitParts(): {
  metal: BufferGeometry[];
  carbon: BufferGeometry[];
  paint: BufferGeometry[];
} {
  return {
    metal: [new SphereGeometry(0.13, 20, 14).translate(-0.02, 0.75, 0)],
    carbon: [
      box([0.05, 0.05, 0.17], [0.09, 0.76, 0]),
      new CircleGeometry(1, 24)
        .scale(0.42, 0.24, 1)
        .rotateX(-Math.PI / 2)
        .translate(0.05, 0.645, 0),
      ...bothSides((s) => rod([0.6, 0.62, s * 0.42], [0.6, 0.73, s * 0.5], 0.008)),
    ],
    paint: bothSides((s) => box([0.06, 0.07, 0.15], [0.6, 0.76, s * 0.52])),
  };
}

/** The rear light at the end of the crash structure. */
const rearLight = () => box([0.04, 0.09, 0.06], [-2.72, 0.3, 0]);

/** The near level of detail's parts, the wheels apart (they spin, so they are instanced). */
export function nearParts(): Parts {
  const sides = 24;
  const chassis = loft(CHASSIS, sides);
  const cover = loft(ENGINE_COVER, sides);
  const pods = bothSides((side) => loft(sidepod(side), sides));
  const headrest = loft(HEADREST, 16);
  const diffuser = loft(DIFFUSER, 4);
  const cockpit = cockpitParts();
  return {
    paint: [
      chassis.tube,
      chassis.front,
      chassis.back,
      cover.tube,
      cover.back,
      ...pods.flatMap((pod) => [pod.tube, pod.back]),
      headrest.tube,
      headrest.back,
      ...paintedPlates(),
      ...cockpit.paint,
    ],
    carbon: [
      cover.front,
      ...pods.map((pod) => pod.front),
      headrest.front,
      floor(true),
      diffuser.tube,
      diffuser.back,
      ...frontWing(),
      ...rearWing(),
      ...beamWing(),
      ...carbonPlates(),
      ...halo(),
      ...suspension(),
      ...cockpit.carbon,
    ],
    metal: cockpit.metal,
    light: [rearLight()],
  };
}

/** The far level of detail's parts, wheels included: coarse lofts and boxes for the wings. */
export function farParts(): Parts {
  const sides = 8;
  const chassis = loft(CHASSIS, sides);
  const cover = loft(ENGINE_COVER, sides);
  const pods = bothSides((side) => loft(sidepod(side), sides));
  return {
    paint: [
      chassis.tube,
      chassis.front,
      chassis.back,
      cover.tube,
      cover.back,
      ...pods.flatMap((pod) => [pod.tube, pod.back]),
      ...bothSides((s) => box([0.6, 0.26, 0.012], [HALF_LENGTH - 0.3, 0.2, s * 0.9])),
      ...bothSides((s) => box([0.58, 0.48, 0.012], [-HALF_LENGTH + 0.29, 0.68, s * 0.485])),
      plate(
        [
          [-0.6, 0.9],
          [-2.2, 0.43],
          [-2.2, 0.52],
          [-0.6, 0.94],
        ],
        0,
        0,
        0.012,
      ),
    ],
    carbon: [
      cover.front,
      ...pods.map((pod) => pod.front),
      floor(false),
      box([0.36, 0.03, 1.78], [2.6, 0.1, 0], 0.1),
      box([0.2, 0.025, 1.3], [2.42, 0.22, 0], 0.45),
      box([0.32, 0.03, 0.94], [-2.56, 0.73, 0], -0.15),
      box([0.2, 0.025, 0.94], [-2.65, 0.84, 0], -0.55),
      box([0.6, 0.02, 1.0], [-2.1, 0.13, 0], -0.35),
      ...WHEEL_CENTRES.map(([x, z], index) =>
        new BoxGeometry(
          WHEEL_RADIUS * 2,
          WHEEL_RADIUS * 2,
          index < 2 ? TYRE_WIDTH.front : TYRE_WIDTH.rear,
        ).translate(x, WHEEL_RADIUS, z),
      ),
    ],
    metal: [new SphereGeometry(0.13, 8, 6).translate(-0.02, 0.75, 0)],
    light: [rearLight()],
  };
}

/**
 * One wheel of the front tyre's width, its axle along z, centred on the origin: the tyre, with
 * its rounded sidewalls, as rubber and the rim with its flat wheel cover as metal. A rear wheel
 * is the same wheel stretched along its axle.
 */
export function wheelParts(segments: number): Parts {
  const w = TYRE_WIDTH.front;
  const lathe = (profile: [number, number][]) =>
    new LatheGeometry(
      profile.map(([r, y]) => new Vector2(r, y)),
      segments,
    ).rotateX(Math.PI / 2);
  return {
    rubber: [
      lathe([
        [RIM_RADIUS, -w / 2 + 0.015],
        [0.3, -w / 2],
        [0.345, -w / 2 + 0.012],
        [WHEEL_RADIUS, -w / 2 + 0.035],
        [WHEEL_RADIUS, w / 2 - 0.035],
        [0.345, w / 2 - 0.012],
        [0.3, w / 2],
        [RIM_RADIUS, w / 2 - 0.015],
      ]),
    ],
    metal: [
      lathe([
        [0, w / 2 - 0.04],
        [0.19, w / 2 - 0.025],
        [0.225, w / 2 - 0.015],
        [RIM_RADIUS + 0.002, w / 2 - 0.01],
        [RIM_RADIUS + 0.002, -w / 2 + 0.01],
        [0.225, -w / 2 + 0.015],
        [0.19, -w / 2 + 0.025],
        [0, -w / 2 + 0.04],
      ]),
    ],
  };
}
