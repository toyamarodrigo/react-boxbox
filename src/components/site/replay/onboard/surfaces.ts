/**
 * The ground-level part of the Onboard view's scenery: the ground, the run-off, the asphalt of
 * the lap and the pit lane, the white lines, the start/finish line and grid, and the raised kerbs.
 *
 * Everything flat lies on the ground and is drawn first, in order, without writing depth, so the
 * layers never flicker against each other however far away they are. Within one merged geometry
 * the triangles draw in the order they were added, so a later layer covers an earlier one.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  type Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { GARAGE_STRETCH } from '@/data/pit-garages';
import { MeshBuilder, samplesAlong } from './mesh-builder';
import { grainTexture, roughnessTexture } from './textures';
import {
  type Centreline,
  type TrackModel,
  type TrackPoint,
  angleDelta,
  pointAt,
  sideways,
} from './track';
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
  Array.from(line.x, (x, index) => ({
    x,
    z: line.z[index]!,
    y: line.y?.[index] ?? 0,
    heading: line.heading[index]!,
  }));

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

/**
 * The ground: how far beyond the circuit it reaches, in metres, and on rising ground the grid of
 * its heightfield: the spacing over the circuit, how much wider each step grows beyond it, and how
 * far below the lap's heights it lies, so the surfaces on it always draw over it.
 */
export const GROUND = { reach: 2000, step: 15, margin: 150, growth: 1.3, drop: 0.15 } as const;

/**
 * Grid lines from `low - reach` to `high + reach`: `GROUND.step` apart from `low` to `high`, wider
 * by `GROUND.growth` each step beyond.
 */
export function groundAxis(low: number, high: number, reach: number): number[] {
  const count = Math.max(1, Math.ceil((high - low) / GROUND.step));
  const inner = Array.from(
    { length: count + 1 },
    (_, index) => low + ((high - low) * index) / count,
  );
  const before: number[] = [];
  const after: number[] = [];
  let step = GROUND.step;
  let out = 0;
  while (out < reach) {
    step *= GROUND.growth;
    out = Math.min(reach, out + step);
    before.unshift(low - out);
    after.push(high + out);
  }
  return [...before, ...inner, ...after];
}

/** The ground's heightfield: its grid lines and a height at each crossing, row by row along `zs`. */
export type GroundGrid = { xs: number[]; zs: number[]; heights: Float32Array };

/** The cell of `axis` that `value` falls in, clamped to the grid. */
function cellOf(axis: readonly number[], value: number): number {
  let low = 0;
  let high = axis.length - 1;
  if (value >= axis[high]!) return high - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (axis[middle]! <= value) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * The triangle of the grid under `x`, `z`: its three crossings and their weights there. Each cell
 * is cut from its corner at the next column to its corner at the next row, as `groundField`
 * draws it.
 */
function triangleAt(
  { xs, zs }: GroundGrid,
  x: number,
  z: number,
): { corners: [number, number, number]; weights: [number, number, number] } {
  const column = cellOf(xs, x);
  const row = cellOf(zs, z);
  const clamp = (t: number) => Math.min(Math.max(t, 0), 1);
  const u = clamp((x - xs[column]!) / (xs[column + 1]! - xs[column]!));
  const v = clamp((z - zs[row]!) / (zs[row + 1]! - zs[row]!));
  const a = row * xs.length + column;
  const c = a + xs.length;
  return u + v <= 1
    ? { corners: [a, a + 1, c], weights: [1 - u - v, u, v] }
    : { corners: [c + 1, c, a + 1], weights: [u + v - 1, 1 - u, 1 - v] };
}

/** The ground's height at `x`, `z`, as its triangles draw it. */
export function gridHeight(grid: GroundGrid, x: number, z: number): number {
  const { corners, weights } = triangleAt(grid, x, z);
  return corners.reduce((sum, corner, index) => sum + grid.heights[corner]! * weights[index]!, 0);
}

/**
 * Points of the flat surfaces to check the ground under, with their height: across the lap's
 * asphalt and run-off out to the barriers (a street circuit's asphalt out to its walls) and across
 * the pit lane, at each share `along` of the way between their samples, `across` metres apart.
 */
export function forEachSurfacePoint(
  track: TrackModel,
  plan: SurfacePlan,
  visit: (x: number, z: number, y: number) => void,
  { along = [0, 0.5], across: spacing = 1.5 }: { along?: readonly number[]; across?: number } = {},
) {
  const half = track.width / 2;
  const edge = half + KERB.width + 0.1;
  const g = plan.garageSide;
  const lines = [
    {
      line: track.lap,
      closed: true,
      across: (index: number): [number, number] =>
        track.street ? [-edge, edge] : [plan.barrier[-1][index]!, plan.barrier[1][index]!],
    },
    {
      line: track.pit,
      closed: false,
      across: (): [number, number] => {
        const ends = [-g * PIT_LANE.fast, g * (PIT_LANE.fast + PIT_LANE.working)];
        return [Math.min(...ends), Math.max(...ends)];
      },
    },
  ];
  for (const { line, closed, across } of lines) {
    const points = pointsOf(line);
    const n = points.length;
    for (let index = 0; index < (closed ? n : n - 1); index++) {
      const a = points[index]!;
      const b = points[(index + 1) % n]!;
      const [aFrom, aTo] = across(index);
      const [bFrom, bTo] = across((index + 1) % n);
      for (const t of along) {
        const heading = a.heading + angleDelta(a.heading, b.heading) * t;
        const from = aFrom + (bFrom - aFrom) * t;
        const to = aTo + (bTo - aTo) * t;
        const steps = Math.max(1, Math.ceil((to - from) / spacing));
        for (let step = 0; step <= steps; step++) {
          const [x, z] = sideways(
            a.x + (b.x - a.x) * t,
            a.z + (b.z - a.z) * t,
            heading,
            from + ((to - from) * step) / steps,
          );
          visit(x, z, a.y + (b.y - a.y) * t);
        }
      }
    }
  }
}

/**
 * The ground of a circuit with elevation, as a heightfield: at `groundAt`, `GROUND.drop` below it,
 * fine over the circuit and coarser out to the horizon. Then lowered wherever it would still rise
 * through a flat surface: a cell's straight sides cut across a dip in the track, and the lap's
 * heights nearby blend in a higher stretch, so on its own it would show through the asphalt as
 * grass, or as pavement on a street circuit.
 */
export function groundGrid(track: TrackModel, plan: SurfacePlan): GroundGrid {
  const { centre, radius } = track;
  const span = radius + GROUND.margin;
  const reach = radius + GROUND.reach - span;
  const xs = groundAxis(centre.x - span, centre.x + span, reach);
  const zs = groundAxis(centre.z - span, centre.z + span, reach);
  const heights = new Float32Array(xs.length * zs.length);
  for (const [row, z] of zs.entries()) {
    for (const [column, x] of xs.entries()) {
      heights[row * xs.length + column] = track.groundAt(x, z) - GROUND.drop;
    }
  }
  const grid = { xs, zs, heights };
  // Lowering a triangle's three crossings by the same amount lowers it that much everywhere, and
  // lowering never lifts the ground anywhere else, so one pass leaves every point under its surface.
  forEachSurfacePoint(track, plan, (x, z, y) => {
    const { corners, weights } = triangleAt(grid, x, z);
    let above = GROUND.drop - y;
    for (const [index, corner] of corners.entries()) above += heights[corner]! * weights[index]!;
    if (above > 0) for (const corner of corners) heights[corner]! -= above;
  });
  return grid;
}

/**
 * The ground of a circuit with elevation, from `groundGrid`. It writes depth, pushed back a
 * little, so a hill hides the track behind it while the surfaces on it, which do not, still draw
 * over it.
 */
function groundField({ xs, zs, heights }: GroundGrid, colour: Color): Mesh {
  const columns = xs.length;
  const positions = new Float32Array(columns * zs.length * 3);
  for (const [row, z] of zs.entries()) {
    for (const [column, x] of xs.entries()) {
      const at = row * columns + column;
      positions[at * 3] = x;
      positions[at * 3 + 1] = heights[at]!;
      positions[at * 3 + 2] = z;
    }
  }
  const indices = new Uint32Array((columns - 1) * (zs.length - 1) * 6);
  let next = 0;
  for (let row = 0; row < zs.length - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      // Counter-clockwise seen from above (+y), so the top is the front face.
      indices.set([a, c, b, b, c, d], next);
      next += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: colour,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
    }),
  );
  mesh.renderOrder = -9;
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
 * maximum; see `MAX_ANISOTROPY`); a circuit with elevation lies on `ground`.
 */
export function addSurfaces(
  group: Group,
  track: TrackModel,
  plan: SurfacePlan,
  anisotropy = 1,
  ground: GroundGrid | undefined = track.elevated ? groundGrid(track, plan) : undefined,
) {
  const { lap, pit, centre, radius, street } = track;
  const half = track.width / 2;
  const lapPoints = pointsOf(lap);

  const colour = street ? COLOURS.pavement : COLOURS.grass;
  if (ground) {
    group.add(groundField(ground, colour));
  } else {
    const ground = new Mesh(new PlaneGeometry(1, 1), flatMaterial({ color: colour, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.scale.set((radius + GROUND.reach) * 2, (radius + GROUND.reach) * 2, 1);
    ground.position.set(centre.x, 0, centre.z);
    ground.renderOrder = -9;
    group.add(ground);
  }

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
