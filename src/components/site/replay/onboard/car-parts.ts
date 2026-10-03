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

/** 18-inch rims in tyres a little smaller and narrower than the 2022–25 cars'. */
export const WHEEL_RADIUS = 0.355;
const RIM_RADIUS = 0.23;
export const AXLE = { front: 1.72, rear: -1.88 } as const;
export const TYRE_WIDTH = { front: 0.28, rear: 0.37 } as const;
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

/**
 * The nose and the monocoque, tip to behind the cockpit: a long low nose raked up from the front
 * wing to a flat-topped chassis with crisp shoulders, the cockpit's rim a little under the tops
 * of the front tyres.
 */
const CHASSIS: LoftStation[] = [
  { x: 2.78, halfWidth: 0.035, bottom: 0.1, top: 0.17, bend: 0.9 },
  { x: 2.45, halfWidth: 0.075, bottom: 0.11, top: 0.24, bend: 0.8 },
  { x: 2.05, halfWidth: 0.12, bottom: 0.14, top: 0.34, bend: 0.7, bendBelow: 0.6 },
  { x: 1.65, halfWidth: 0.16, bottom: 0.18, top: 0.44, bend: 0.6, bendBelow: 0.5 },
  { x: 1.25, halfWidth: 0.21, bottom: 0.17, top: 0.52, bend: 0.5, bendBelow: 0.45 },
  { x: 0.85, halfWidth: 0.27, bottom: 0.1, top: 0.57, bend: 0.45, bendBelow: 0.35 },
  { x: 0.45, halfWidth: 0.32, bottom: 0.08, top: 0.6, bend: 0.42, bendBelow: 0.3 },
  { x: 0.0, halfWidth: 0.35, bottom: 0.08, top: 0.6, bend: 0.42, bendBelow: 0.3 },
  { x: -0.45, halfWidth: 0.35, bottom: 0.08, top: 0.59, bend: 0.42, bendBelow: 0.3 },
  { x: -0.8, halfWidth: 0.32, bottom: 0.08, top: 0.56, bend: 0.45, bendBelow: 0.3 },
];

/**
 * The airbox over the driver's head and the engine cover, down to the rear crash structure:
 * tight over the engine, its flanks tucked in under a shoulder.
 */
const ENGINE_COVER: LoftStation[] = [
  { x: -0.15, halfWidth: 0.13, bottom: 0.62, top: CAR_HEIGHT_M, bend: 0.75 },
  { x: -0.45, halfWidth: 0.21, bottom: 0.36, top: 0.93, bend: 0.6 },
  { x: -0.85, halfWidth: 0.26, bottom: 0.14, top: 0.8, bend: 0.5, shoulder: 0.62, tuck: 0.25 },
  { x: -1.35, halfWidth: 0.21, bottom: 0.12, top: 0.62, bend: 0.5, shoulder: 0.62, tuck: 0.3 },
  { x: -1.85, halfWidth: 0.13, bottom: 0.14, top: 0.47, bend: 0.55, shoulder: 0.6, tuck: 0.2 },
  { x: -2.3, halfWidth: 0.075, bottom: 0.2, top: 0.37, bend: 0.7 },
  { x: -2.72, halfWidth: 0.05, bottom: 0.25, top: 0.33, bend: 0.85 },
];

/**
 * A sidepod on `side`: a narrow inlet, a flat top with a crisp shoulder over a deep undercut,
 * then a tight coke bottle down to the floor ahead of the rear tyres.
 */
const sidepod = (side: 1 | -1): LoftStation[] => {
  const pod = { bend: 0.32, bendBelow: 0.6 };
  return [
    { x: 0.85, z: side * 0.5, halfWidth: 0.1, bottom: 0.34, top: 0.55, bend: 0.45, shoulder: 0.7 },
    {
      ...pod,
      x: 0.6,
      z: side * 0.52,
      halfWidth: 0.2,
      bottom: 0.22,
      top: 0.56,
      shoulder: 0.78,
      tuck: 0.5,
    },
    {
      ...pod,
      x: 0.1,
      z: side * 0.5,
      halfWidth: 0.22,
      bottom: 0.12,
      top: 0.55,
      shoulder: 0.8,
      tuck: 0.6,
    },
    {
      ...pod,
      x: -0.5,
      z: side * 0.44,
      halfWidth: 0.2,
      bottom: 0.1,
      top: 0.5,
      shoulder: 0.78,
      tuck: 0.6,
    },
    {
      ...pod,
      x: -1.1,
      z: side * 0.33,
      halfWidth: 0.13,
      bottom: 0.1,
      top: 0.37,
      shoulder: 0.7,
      tuck: 0.45,
    },
    { x: -1.55, z: side * 0.24, halfWidth: 0.07, bottom: 0.1, top: 0.24, bend: 0.7 },
  ];
};

/** The headrest and cockpit surround behind the driver's helmet. */
const HEADREST: LoftStation[] = [
  { x: -0.12, halfWidth: 0.28, bottom: 0.57, top: 0.69, bend: 0.45 },
  { x: -0.5, halfWidth: 0.3, bottom: 0.57, top: 0.71, bend: 0.45 },
];

/** The diffuser: a channel rising from the floor to the back, closed over; the strakes stand in it. */
const DIFFUSER: LoftStation[] = [
  { x: -1.5, halfWidth: 0.5, bottom: 0.04, top: 0.09 },
  { x: -2.0, halfWidth: 0.5, bottom: 0.08, top: 0.13 },
  { x: -2.62, halfWidth: 0.48, bottom: 0.3, top: 0.35 },
];

/** The floor's plan, half of it, from the front, as (x, z): it necks in before the rear tyres. */
const FLOOR_PLAN: [number, number][] = [
  [1.25, 0.26],
  [1.05, 0.6],
  [0.8, 0.8],
  [-1.05, 0.8],
  [-1.35, 0.62],
  [-1.5, 0.52],
  [-2.35, 0.5],
];

/** The floor, a plate just off the ground with a crisp, lightly rounded edge. */
function floor(round: boolean): BufferGeometry {
  const outline: [number, number][] = [
    ...FLOOR_PLAN,
    ...[...FLOOR_PLAN].reverse().map(([x, z]): [number, number] => [x, -z]),
  ];
  // Drawn in the car's x and z, the plate's thickness along y.
  return plate(outline, round ? 0.05 : 0, 0, 0.03)
    .rotateX(Math.PI / 2)
    .translate(0, 0.06, 0);
}

const FRONT_WING = { thickness: 0.09, camber: -0.06, points: 9 } as const;
const REAR_WING = { thickness: 0.1, camber: -0.06, points: 9 } as const;

/** How far either side the front wing's endplates stand, and the rear wing's. */
const FRONT_ENDPLATE_Z = 0.9;
const REAR_ENDPLATE_Z = 0.53;

/**
 * The front wing: a broad flat main plane under the nose out to the endplates, and three flaps
 * stepping up behind it either side, each steeper, their trailing edges up as a wing that
 * presses the car down.
 */
function frontWing(): BufferGeometry[] {
  const main = wing(
    mirrored([
      { z: 0, x: HALF_LENGTH, y: 0.07, chord: 0.42, angle: -0.04 },
      { z: 0.3, x: HALF_LENGTH, y: 0.072, chord: 0.42, angle: -0.04 },
      { z: 0.6, x: HALF_LENGTH - 0.01, y: 0.078, chord: 0.4, angle: -0.05 },
      { z: FRONT_ENDPLATE_Z, x: HALF_LENGTH - 0.03, y: 0.09, chord: 0.36, angle: -0.06 },
    ]),
    FRONT_WING,
  );
  const flap = (x: number, y: number, chord: number, angle: number, inner: number) =>
    bothSides((side) =>
      wing(
        [
          { z: side * inner, x, y, chord, angle },
          { z: side * 0.5, x, y, chord, angle },
          { z: side * FRONT_ENDPLATE_Z, x: x + 0.02, y: y - 0.01, chord: chord * 0.9, angle },
        ].sort((a, b) => a.z - b.z),
        FRONT_WING,
      ),
    ).flat();
  return [
    ...main,
    ...flap(2.42, 0.105, 0.2, -0.3, 0.16),
    ...flap(2.26, 0.17, 0.15, -0.52, 0.2),
    ...flap(2.15, 0.245, 0.11, -0.75, 0.24),
  ];
}

/** A wing spanning between two endplates `half` either side, flat across. */
const span = (half: number, x: number, y: number, chord: number, angle: number): WingStation[] =>
  [-half, 0, half].map((z) => ({ z, x, y, chord, angle }));

/** The rear wing's main plane and its steep flap over it, between the endplates. */
function rearWing(): BufferGeometry[] {
  return [
    ...wing(span(REAR_ENDPLATE_Z, -2.33, 0.74, 0.34, -0.12), REAR_WING),
    ...wing(span(REAR_ENDPLATE_Z, -2.6, 0.805, 0.17, -0.62), REAR_WING),
  ];
}

/** The beam wing's two elements, low between the endplates over the diffuser's exit. */
function beamWing(): BufferGeometry[] {
  return [
    ...wing(span(REAR_ENDPLATE_Z, -2.44, 0.4, 0.15, -0.25), REAR_WING),
    ...wing(span(REAR_ENDPLATE_Z, -2.6, 0.47, 0.13, -0.5), REAR_WING),
  ];
}

/**
 * The halo: its hoop round the cockpit and the pillar from the chassis in front of the driver,
 * round enough in section and along its length that neither shows a facet.
 */
function halo(): BufferGeometry[] {
  const hoop = new CatmullRomCurve3(
    [
      [-0.5, 0.6, 0.31],
      [-0.32, 0.81, 0.3],
      [0.08, 0.86, 0.24],
      [0.33, 0.86, 0],
      [0.08, 0.86, -0.24],
      [-0.32, 0.81, -0.3],
      [-0.5, 0.6, -0.31],
    ].map(([x, y, z]) => new Vector3(x, y, z)),
  );
  const pillar = new CatmullRomCurve3(
    [
      [0.66, 0.58, 0],
      [0.48, 0.78, 0],
      [0.31, 0.86, 0],
    ].map(([x, y, z]) => new Vector3(x, y, z)),
  );
  return [new TubeGeometry(hoop, 64, 0.032, 12), new TubeGeometry(pillar, 16, 0.03, 12)];
}

/** The suspension's wishbones and the push or pull rod at each corner. */
function suspension(): BufferGeometry[] {
  const arm = 0.012;
  const front = (s: 1 | -1): BufferGeometry[] => [
    rod([1.95, 0.46, s * 0.16], [AXLE.front, 0.48, s * 0.68], arm),
    rod([1.5, 0.44, s * 0.2], [AXLE.front, 0.48, s * 0.68], arm),
    rod([1.95, 0.2, s * 0.15], [AXLE.front, 0.2, s * 0.68], arm),
    rod([1.5, 0.18, s * 0.2], [AXLE.front, 0.2, s * 0.68], arm),
    rod([1.69, 0.22, s * 0.64], [1.55, 0.5, s * 0.22], 0.01),
  ];
  const rear = (s: 1 | -1): BufferGeometry[] => [
    rod([-1.6, 0.46, s * 0.17], [AXLE.rear, 0.48, s * 0.57], arm),
    rod([-2.15, 0.44, s * 0.12], [AXLE.rear, 0.48, s * 0.57], arm),
    rod([-1.6, 0.16, s * 0.28], [AXLE.rear, 0.2, s * 0.57], arm),
    rod([-2.2, 0.18, s * 0.22], [AXLE.rear, 0.2, s * 0.57], arm),
    rod([AXLE.rear, 0.48, s * 0.55], [-1.78, 0.22, s * 0.2], 0.01),
  ];
  return [...bothSides(front).flat(), ...bothSides(rear).flat()];
}

/** The front wing's endplates, the rear wing's and the shark fin, painted plates. */
function paintedPlates(): BufferGeometry[] {
  return [
    ...bothSides((s) =>
      plate(
        [
          [HALF_LENGTH, 0.06],
          [2.12, 0.04],
          [2.08, 0.12],
          [2.1, 0.34],
          [2.5, 0.33],
          [HALF_LENGTH, 0.2],
        ],
        0.03,
        s * (FRONT_ENDPLATE_Z + 0.006),
        0.012,
      ),
    ),
    ...bothSides((s) =>
      plate(
        [
          [-2.24, 0.62],
          [-2.36, 0.36],
          [-HALF_LENGTH, 0.34],
          [-HALF_LENGTH, 0.93],
          [-2.4, 0.94],
          [-2.26, 0.86],
        ],
        0.04,
        s * (REAR_ENDPLATE_Z + 0.006),
        0.012,
      ),
    ),
    plate(
      [
        [-0.5, 0.9],
        [-1.0, 0.72],
        [-1.5, 0.55],
        [-2.0, 0.42],
        [-2.0, 0.48],
        [-1.5, 0.62],
        [-1.0, 0.8],
        [-0.5, 0.94],
      ],
      0.01,
      0,
      0.01,
    ),
  ];
}

/**
 * The rear wing's pylons, the diffuser's side walls and strakes, and the lips along the floor's
 * edges, carbon plates.
 */
function carbonPlates(): BufferGeometry[] {
  return [
    ...bothSides((s) =>
      plate(
        [
          [-2.15, 0.36],
          [-2.42, 0.34],
          [-2.52, 0.76],
          [-2.36, 0.77],
        ],
        0.01,
        s * 0.1,
        0.012,
      ),
    ),
    ...bothSides((s) =>
      plate(
        [
          [-1.5, 0.04],
          [-2.62, 0.28],
          [-2.62, 0.4],
          [-1.5, 0.1],
        ],
        0.01,
        s * 0.5,
        0.01,
      ),
    ),
    ...bothSides((s) =>
      [0.15, 0.3, 0.42].map((z) => box([0.75, 0.09, 0.008], [-2.17, 0.19, s * z], -0.34)),
    ).flat(),
    ...bothSides((s) => box([1.85, 0.05, 0.008], [-0.125, 0.095, s * 0.795])),
  ];
}

/** The driver's helmet, with its visor, and the mirrors on their stalks. */
function cockpitParts(): {
  metal: BufferGeometry[];
  carbon: BufferGeometry[];
  paint: BufferGeometry[];
} {
  return {
    metal: [new SphereGeometry(0.125, 24, 16).translate(-0.02, 0.72, 0)],
    carbon: [
      box([0.05, 0.045, 0.17], [0.085, 0.73, 0]),
      new CircleGeometry(1, 24)
        .scale(0.42, 0.22, 1)
        .rotateX(-Math.PI / 2)
        .translate(0.05, 0.603, 0),
      ...bothSides((s) => rod([0.55, 0.58, s * 0.3], [0.55, 0.68, s * 0.47], 0.008)),
    ],
    paint: bothSides((s) => box([0.06, 0.065, 0.15], [0.55, 0.7, s * 0.5])),
  };
}

/** The rear light at the end of the crash structure. */
const rearLight = () => box([0.04, 0.07, 0.06], [-2.73, 0.29, 0]);

/** The near level of detail's parts, the wheels apart (they spin, so they are instanced). */
export function nearParts(): Parts {
  const chassis = loft(CHASSIS, 32, 3);
  const cover = loft(ENGINE_COVER, 32, 4);
  const pods = bothSides((side) => loft(sidepod(side), 28, 4));
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
      ...bothSides((s) =>
        box([0.7, 0.3, 0.012], [HALF_LENGTH - 0.35, 0.19, s * (FRONT_ENDPLATE_Z + 0.006)]),
      ),
      ...bothSides((s) =>
        box([0.56, 0.59, 0.012], [-HALF_LENGTH + 0.28, 0.635, s * (REAR_ENDPLATE_Z + 0.006)]),
      ),
      plate(
        [
          [-0.5, 0.9],
          [-2.0, 0.42],
          [-2.0, 0.48],
          [-0.5, 0.94],
        ],
        0,
        0,
        0.01,
      ),
    ],
    carbon: [
      cover.front,
      ...pods.map((pod) => pod.front),
      floor(false),
      box([0.42, 0.03, FRONT_ENDPLATE_Z * 2], [HALF_LENGTH - 0.21, 0.08, 0], -0.04),
      box([0.4, 0.025, FRONT_ENDPLATE_Z * 2], [2.25, 0.21, 0], -0.55),
      box([0.34, 0.03, REAR_ENDPLATE_Z * 2], [-2.5, 0.76, 0], -0.12),
      box([0.17, 0.025, REAR_ENDPLATE_Z * 2], [-2.68, 0.855, 0], -0.62),
      box([0.3, 0.025, REAR_ENDPLATE_Z * 2], [-2.52, 0.44, 0], -0.4),
      box([0.65, 0.02, 1.0], [-2.25, 0.17, 0], -0.34),
      ...WHEEL_CENTRES.map(([x, z], index) =>
        new BoxGeometry(
          WHEEL_RADIUS * 2,
          WHEEL_RADIUS * 2,
          index < 2 ? TYRE_WIDTH.front : TYRE_WIDTH.rear,
        ).translate(x, WHEEL_RADIUS, z),
      ),
    ],
    metal: [new SphereGeometry(0.125, 8, 6).translate(-0.02, 0.72, 0)],
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
        [0.285, -w / 2],
        [0.335, -w / 2 + 0.012],
        [WHEEL_RADIUS, -w / 2 + 0.032],
        [WHEEL_RADIUS, w / 2 - 0.032],
        [0.335, w / 2 - 0.012],
        [0.285, w / 2],
        [RIM_RADIUS, w / 2 - 0.015],
      ]),
    ],
    metal: [
      lathe([
        [0, w / 2 - 0.04],
        [0.18, w / 2 - 0.025],
        [0.215, w / 2 - 0.015],
        [RIM_RADIUS + 0.002, w / 2 - 0.01],
        [RIM_RADIUS + 0.002, -w / 2 + 0.01],
        [0.215, -w / 2 + 0.015],
        [0.18, -w / 2 + 0.025],
        [0, -w / 2 + 0.04],
      ]),
    ],
  };
}
