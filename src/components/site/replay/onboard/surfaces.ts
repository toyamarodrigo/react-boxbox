/**
 * The ground-level part of the Onboard view's scenery: the ground, the run-off, the asphalt of
 * the lap and the pit lane, the white lines, the start/finish line and grid, and the raised kerbs.
 *
 * Everything flat lies on the ground and is drawn first, in order, without writing depth, so the
 * layers never flicker against each other however far away they are. Within one merged geometry
 * the triangles draw in the order they were added, so a later layer covers an earlier one.
 */
import { Color, DoubleSide, type Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { GARAGE_STRETCH } from '@/data/pit-garages';
import { MeshBuilder, samplesAlong } from './mesh-builder';
import { grainTexture, roughnessTexture } from './textures';
import { type Centreline, type TrackModel, type TrackPoint, pointAt } from './track';
import type { KerbRange, Side } from './trackside';

export const COLOURS = {
  grass: new Color('#4f7d3c'),
  verge: new Color('#5a8a43'),
  gravel: new Color('#b9a582'),
  pavement: new Color('#8d8c87'),
  asphalt: new Color('#4a4c51'),
  pitAsphalt: new Color('#55585d'),
  line: new Color('#ececec'),
  kerbRed: new Color('#c8272d'),
  kerbWhite: new Color('#f1f1f1'),
} as const;

/** A kerb's width beyond the track edge, in metres, and how high its outer edge stands. */
export const KERB = { width: 1.2, lip: 0.07 } as const;

/**
 * The pit lane across, in metres from the line the cars drive (positive towards the garages):
 * the fast lane either side of it, and the working lane in front of the garages beyond.
 */
export const PIT_LANE = { fast: 2.5, working: 4 } as const;

/** The samples of a line as points. */
export const pointsOf = (line: Centreline): TrackPoint[] =>
  Array.from(line.x, (x, index) => ({ x, z: line.z[index]!, heading: line.heading[index]! }));

/** A point `metres` along the lap in its own (smoothed) metres, as `corners` measures it. */
export const lapPoint = (lap: Centreline, metres: number): TrackPoint =>
  pointAt(lap, (metres * lap.nominal) / lap.length);

/**
 * How much of the pit lane's working lane is there `share` of the way along it: all of it
 * alongside the garages, easing to none towards the entry and the exit.
 */
export function workingLaneAt(share: number): number {
  const ease = 0.06;
  const from = GARAGE_STRETCH.from - 0.04;
  const to = GARAGE_STRETCH.to + 0.04;
  const t = Math.min(Math.max(Math.min(share - from, to - share) / ease + 0.5, 0), 1);
  return t * t * (3 - 2 * t);
}

/** Metres from the line the cars drive to the middle of the working lane, towards the garages. */
export const WORKING_LANE_MIDDLE = PIT_LANE.fast + PIT_LANE.working / 2;

/**
 * How many metres before its box a car on a stop with a stationary time starts to leave the fast
 * lane, and how many after its box it is back in it.
 */
export const BOX_SWING_M = 15;

/**
 * How far across into the working lane such a car is, `metres` along the pit lane with its box
 * at `boxMetres`: 0 in the fast lane, easing to 1 in front of its garage over `BOX_SWING_M`, where
 * it stands for its stationary time, and easing back to 0 after. Times `WORKING_LANE_MIDDLE` for
 * metres across; the place along the lane and the timing stay as they are.
 */
export function boxSwing(metres: number, boxMetres: number): number {
  const t = Math.min(Math.max(1 - Math.abs(metres - boxMetres) / BOX_SWING_M, 0), 1);
  return t * t * (3 - 2 * t);
}

const flatMaterial = (options: ConstructorParameters<typeof MeshStandardMaterial>[0]) =>
  new MeshStandardMaterial({ depthWrite: false, side: DoubleSide, ...options });

function flat(builder: MeshBuilder, material: MeshStandardMaterial, order: number): Mesh {
  const mesh = new Mesh(builder.geometry(), material);
  mesh.renderOrder = order;
  return mesh;
}

/** What the surfaces need beyond the track: the run-off's reach and which sides are kerbed. */
export type SurfacePlan = {
  /** Metres to the left (side 1) or right (side −1) of the lap where the barrier stands. */
  barrier: Record<Side, Float64Array>;
  /** True for each lap segment and side in a gravel trap. */
  gravel: Record<Side, Uint8Array>;
  kerbs: readonly KerbRange[];
  /** Which side of the pit lane the garages are on, as a side of travel. */
  garageSide: Side;
};

/**
 * Adds the surfaces to `group`. Their grain textures filter with `anisotropy` (the renderer's
 * maximum; see `MAX_ANISOTROPY`).
 */
export function addSurfaces(group: Group, track: TrackModel, plan: SurfacePlan, anisotropy = 1) {
  const { lap, pit, centre, radius, street } = track;
  const half = track.width / 2;
  const lapPoints = pointsOf(lap);

  const ground = new Mesh(
    new PlaneGeometry(1, 1),
    flatMaterial({ color: street ? COLOURS.pavement : COLOURS.grass, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set((radius + 2000) * 2, (radius + 2000) * 2, 1);
  ground.position.set(centre.x, 0, centre.z);
  ground.renderOrder = -9;
  group.add(ground);

  // Grass verges out to the barriers and gravel traps on the outside of the corners.
  if (!street) {
    const runoff = new MeshBuilder();
    for (const side of [1, -1] as const) {
      const barrier = plan.barrier[side];
      runoff.strip(lapPoints, {
        inner: () => side * half,
        outer: (index) => barrier[index]!,
        colour: () => COLOURS.verge,
        closed: true,
      });
      runoff.strip(lapPoints, {
        inner: () => side * (half + KERB.width + 1.5),
        outer: (index) => barrier[index]! - side * 1.5,
        // Only where the barrier leaves room for a trap: none where it had to move in.
        colour: (segment) =>
          plan.gravel[side][segment] &&
          Math.abs(barrier[segment]!) > half + KERB.width + 6 &&
          Math.abs(barrier[(segment + 1) % barrier.length]!) > half + KERB.width + 6
            ? COLOURS.gravel
            : undefined,
        closed: true,
      });
    }
    const map = grainTexture('ground', anisotropy);
    group.add(flat(runoff, flatMaterial({ vertexColors: true, map, roughness: 1 }), -8));
  }

  // The pit lane under the lap, so where they meet the lap's asphalt is on top.
  const asphalt = new MeshBuilder();
  const pitPoints = pointsOf(pit);
  const g = plan.garageSide;
  const working = (index: number) => workingLaneAt(pit.s[index]! / pit.length);
  asphalt.strip(pitPoints, {
    inner: () => -g * PIT_LANE.fast,
    outer: (index) => g * (PIT_LANE.fast + PIT_LANE.working * working(index)),
    colour: () => COLOURS.pitAsphalt,
  });
  // A street circuit's asphalt runs out to the walls; kerbs stand on it at the corners.
  const edge = street ? half + KERB.width + 0.1 : half;
  asphalt.strip(lapPoints, {
    inner: () => -edge,
    outer: () => edge,
    colour: () => COLOURS.asphalt,
    closed: true,
  });
  const map = grainTexture('asphalt', anisotropy);
  const roughness = roughnessTexture(anisotropy);
  group.add(
    flat(
      asphalt,
      flatMaterial({ vertexColors: true, map, roughnessMap: roughness, roughness: 1 }),
      -7,
    ),
  );

  group.add(flat(markings(track, plan), flatMaterial({ vertexColors: true, roughness: 0.8 }), -6));

  const kerbs = kerbStrips(lap, half, plan.kerbs);
  if (!kerbs.empty) {
    group.add(
      new Mesh(
        kerbs.geometry(),
        new MeshStandardMaterial({
          vertexColors: true,
          map: grainTexture('paint', anisotropy),
          roughness: 0.6,
        }),
      ),
    );
  }
}

/** The white lines: the track's edges, the pit lane's, the start/finish line and the grid. */
function markings(track: TrackModel, plan: SurfacePlan): MeshBuilder {
  const { lap, pit } = track;
  const half = track.width / 2;
  const builder = new MeshBuilder();
  const white = () => COLOURS.line;
  const lapPoints = pointsOf(lap);
  for (const side of [1, -1] as const) {
    builder.strip(lapPoints, {
      inner: () => side * (half - 0.5),
      outer: () => side * (half - 0.2),
      colour: white,
      closed: true,
    });
  }
  const g = plan.garageSide;
  const pitPoints = pointsOf(pit);
  // The line between the pit lane and the track, painted on the track where the lane joins it.
  builder.strip(pitPoints, {
    inner: () => -g * PIT_LANE.fast,
    outer: () => -g * (PIT_LANE.fast - 0.25),
    colour: white,
  });
  // The fast lane's edge in front of the garages.
  builder.strip(pitPoints, {
    inner: () => g * (PIT_LANE.fast - 0.1),
    outer: () => g * (PIT_LANE.fast + 0.1),
    colour: (segment) =>
      workingLaneAt(pit.s[segment]! / pit.length) > 0.9 ? COLOURS.line : undefined,
  });

  const across = (metres: number, from: number, to: number, depth: number) =>
    builder.strip(
      samplesAlong((at) => pointAt(lap, at), metres - depth / 2, metres + depth / 2, depth),
      {
        inner: () => from,
        outer: () => to,
        colour: white,
      },
    );
  // The start/finish line, and a grid slot for each car behind it, staggered side to side.
  across(0, -half, half, 1.2);
  for (let slot = 0; slot < 22; slot++) {
    const side = slot % 2 === 0 ? 1 : -1;
    const behind = -8 - slot * 8;
    across(behind, side * 0.8, side * (half - 1.2), 0.3);
  }
  return builder;
}

/** The kerbs: striped red and white about every metre, rising to a low lip at their outer edge. */
function kerbStrips(lap: Centreline, half: number, kerbs: readonly KerbRange[]): MeshBuilder {
  const builder = new MeshBuilder();
  for (const kerb of kerbs) {
    const points = samplesAlong((at) => lapPoint(lap, at), kerb.from, kerb.to, 1);
    builder.strip(points, {
      inner: () => kerb.side * (half - 0.15),
      outer: () => kerb.side * (half + KERB.width),
      colour: (segment) => (segment % 2 === 0 ? COLOURS.kerbRed : COLOURS.kerbWhite),
      y: [0.015, KERB.lip],
    });
  }
  return builder;
}
