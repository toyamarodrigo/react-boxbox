/**
 * The marshal light panels of the Onboard view: generic LED boards on posts at regular intervals
 * round the lap, at the barrier away from the pit lane, each turned to face the cars coming
 * towards it. No text and no logos. Close enough together that one is usually in view, and large
 * and bright enough to read from 150 m. Two draw calls for the whole circuit: the housings and
 * posts in one merged mesh, the lit faces as one instanced mesh whose colours `setMarshalLights`
 * changes as the flags do.
 */
import {
  Color,
  Group,
  InstancedMesh,
  type Material,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import type { MarshalLight } from '@/data/onboard-frame';
import { type Plan, planTrackside } from './barriers';
import { MeshBuilder } from './mesh-builder';
import { pointsOf } from './surfaces';
import { type TrackModel, type TrackPoint, sideways } from './track';
import {
  FOOTPRINT_CLEARANCE_M,
  type Side,
  type TrackIndex,
  footprintClear,
  lapGap,
  trackIndex,
} from './trackside';

/** About how far apart the panels stand along the lap, in metres. */
export const MARSHAL_PANEL_SPACING_M = 160;

/**
 * A panel's size in metres (its face, the housing's depth behind it), how high its bottom edge
 * stands off the ground, and how far it is turned from facing straight back up the track towards
 * the track, in radians.
 */
const PANEL = { width: 1.6, height: 1, depth: 0.18, base: 1.5, turn: 0.35 } as const;

/** The housing's rim round the face, in metres. */
const RIM = 0.08;

/** How far a panel's housing reaches either side of its post, across the track, in metres. */
const ACROSS =
  (PANEL.width / 2 + RIM) * Math.cos(PANEL.turn) + (PANEL.depth / 2) * Math.sin(PANEL.turn);

/**
 * Where a panel's post stands from the barrier's line, in metres outward: in front of the barrier,
 * the housing's far end just short of the catch fence, where there is room (a permanent circuit's
 * run-off); else behind the wall, seen through the fence, where the wall stands at the kerb.
 */
const POST_FROM_BARRIER = [-(ACROSS + 0.05), ACROSS + 0.3] as const;

const HOUSING = new Color('#2a2c30');

/**
 * What each light shows. Bright and not tone-mapped, so a lit panel reads at a distance without
 * a bloom pass; a dark one is a dull LED face.
 */
const LIGHT_COLOURS: Record<MarshalLight, Color> = {
  off: new Color('#121417'),
  yellow: new Color('#ffd21a'),
  green: new Color('#1fe05a'),
  red: new Color('#ff2222'),
};

export type MarshalPanels = {
  group: Group;
  /** Each panel's place round the lap, 0 to 1 from the line, as the Track Map measures it. */
  shares: readonly number[];
  /** The lit faces, one instance per panel in `shares` order; `null` when no panel stands. */
  faces: InstancedMesh | null;
  /** What each face shows now, so only a change is sent to the GPU. */
  shown: MarshalLight[];
};

/** Where a panel stands and which way its face looks. */
type Placed = { x: number; z: number; nx: number; nz: number; facing: number };

/** A panel `side` of sample `index`, `from` the barrier's line, facing back up the track. */
function standAt(plan: Plan, point: TrackPoint, index: number, side: Side, from: number): Placed {
  const out = plan.barrier[side][index]! + side * from;
  const [x, z] = sideways(point.x, point.z, point.heading, out);
  // Facing back up the track at the cars coming, turned a little towards the track.
  const [tx, tz] = sideways(0, 0, point.heading, -side);
  const nx = -Math.cos(point.heading) * Math.cos(PANEL.turn) + tx * Math.sin(PANEL.turn);
  const nz = -Math.sin(point.heading) * Math.cos(PANEL.turn) + tz * Math.sin(PANEL.turn);
  return { x, z, nx, nz, facing: Math.atan2(nz, nx) };
}

/** How far beyond the track's edge every corner of a panel's housing keeps, in metres. */
const EDGE_GAP_M = 0.75;

/** The corners of a panel's housing seen from above. */
function cornersOf({ x, z, nx, nz }: Placed): [number, number][] {
  const half = PANEL.width / 2 + RIM;
  const front = PANEL.depth / 2 + 0.01;
  const corners: [number, number][] = [];
  for (const across of [-half, half]) {
    for (const along of [-front, front]) {
      corners.push([x - nz * across + nx * along, z + nx * across + nz * along]);
    }
  }
  return corners;
}

/** How far `x`, `z` is from the lap's segment from sample `index` to the next. */
function segmentDistance({ lap }: TrackModel, index: number, x: number, z: number) {
  const next = (index + 1) % lap.x.length;
  const ax = lap.x[index]!;
  const az = lap.z[index]!;
  const dx = lap.x[next]! - ax;
  const dz = lap.z[next]! - az;
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}

/**
 * True when the panel keeps off the track: its housing's corners clear of the asphalt beside it
 * (where a corner's inside curves towards a panel's end), and its footprint well clear of every
 * other part of the lap, as on a hairpin's far side. Otherwise it stands somewhere else.
 */
function clearOfLap(
  track: TrackModel,
  lapIndex: TrackIndex,
  placed: Placed,
  index: number,
  out: number,
) {
  const { lap } = track;
  const n = lap.x.length;
  const s = lap.s[index]!;
  const window = Math.abs(out) * 1.6 + 12;
  const reach = track.width / 2 + EDGE_GAP_M;
  const corners = cornersOf(placed);
  for (const direction of [1, -1]) {
    for (let step = direction === 1 ? 0 : 1; step < n; step++) {
      const at = (((index + direction * step) % n) + n) % n;
      if (lapGap(lap.s[at]!, s, lap.length) > window) break;
      if (corners.some(([x, z]) => segmentDistance(track, at, x, z) < reach)) return false;
    }
  }
  // `footprintClear` reads `width` along `heading`: the face runs across its normal.
  const footprint = {
    x: placed.x,
    z: placed.z,
    heading: placed.facing + Math.PI / 2,
    width: PANEL.width + 2 * RIM,
    depth: 1,
  };
  const elsewhere: TrackIndex = {
    near: (x, z, radius) =>
      lapIndex.near(x, z, radius, (_, at) => lapGap(at, s, lap.length) < window),
  };
  return footprintClear(elsewhere, footprint, track.width / 2 + FOOTPRINT_CLEARANCE_M);
}

/** Where the panel nearest sample `wanted` can stand: a sample and a side with a barrier. */
function placeFor(
  track: TrackModel,
  plan: Plan,
  lapIndex: TrackIndex,
  points: readonly TrackPoint[],
  wanted: number,
): { index: number; side: Side; placed: Placed } | null {
  const n = points.length;
  // Away from the pit lane first, where the pit wall is not in the way.
  const sides: Side[] = [plan.pitSide === 1 ? -1 : 1, plan.pitSide];
  for (let step = 0; step <= 10; step++) {
    for (const index of step === 0 ? [wanted] : [wanted + step, wanted - step]) {
      const at = ((index % n) + n) % n;
      for (const side of sides) {
        if (plan.keep[side][at] !== 1) continue;
        for (const from of POST_FROM_BARRIER) {
          const placed = standAt(plan, points[at]!, at, side, from);
          if (clearOfLap(track, lapIndex, placed, at, plan.barrier[side][at]!)) {
            return { index: at, side, placed };
          }
        }
      }
    }
  }
  return null;
}

/**
 * The circuit's marshal light panels, every one dark. `lite`, for the low quality level, keeps
 * every panel but lights the housings more cheaply.
 */
export function buildMarshalPanels(
  track: TrackModel,
  plan = planTrackside(track),
  { lite = false }: { lite?: boolean } = {},
): MarshalPanels {
  const { lap } = track;
  const n = lap.x.length;
  const points = pointsOf(lap);
  const lapIndex = trackIndex([lap]);
  const count = Math.max(3, Math.round(lap.length / MARSHAL_PANEL_SPACING_M));
  const housings = new MeshBuilder();
  const holder = new Object3D();
  const matrices: Matrix4[] = [];
  const shares: number[] = [];

  for (let panel = 0; panel < count; panel++) {
    const place = placeFor(track, plan, lapIndex, points, Math.floor(((panel + 0.5) / count) * n));
    if (!place) continue;
    const { index } = place;
    const { x, z, nx, nz, facing } = place.placed;
    const point = points[index]!;
    housings.box(x, point.y, z, facing, [0.14, PANEL.base, 0.14], HOUSING);
    housings.box(
      x,
      point.y + PANEL.base - RIM,
      z,
      facing,
      [PANEL.depth, PANEL.height + 2 * RIM, PANEL.width + 2 * RIM],
      HOUSING,
    );
    const front = PANEL.depth / 2 + 0.01;
    holder.position.set(x + nx * front, point.y + PANEL.base + PANEL.height / 2, z + nz * front);
    // A plane faces +z; turned about `y` by `atan2(nx, nz)` it faces along the panel's normal.
    holder.rotation.set(0, Math.atan2(nx, nz), 0);
    holder.updateMatrix();
    matrices.push(holder.matrix.clone());
    shares.push(lap.s[index]! / lap.length);
  }

  const group = new Group();
  if (shares.length === 0) {
    return { group, shares, faces: null, shown: [] };
  }
  const housing: Material = lite
    ? new MeshLambertMaterial({ vertexColors: true })
    : new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
  group.add(new Mesh(housings.geometry(), housing));
  // Unlit, not tone-mapped and not fogged: a lit face keeps its full colour at any distance.
  const faces = new InstancedMesh(
    new PlaneGeometry(PANEL.width, PANEL.height),
    new MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }),
    shares.length,
  );
  for (const [index, matrix] of matrices.entries()) {
    faces.setMatrixAt(index, matrix);
    faces.setColorAt(index, LIGHT_COLOURS.off);
  }
  faces.instanceMatrix.needsUpdate = true;
  if (faces.instanceColor) faces.instanceColor.needsUpdate = true;
  group.add(faces);
  return { group, shares, faces, shown: shares.map(() => 'off') };
}

/** Shows `lights` (one per panel, in `shares` order) on the panels' faces, if any changed. */
export function setMarshalLights({ faces, shown }: MarshalPanels, lights: readonly MarshalLight[]) {
  if (!faces) return;
  let changed = false;
  for (const [index, light] of lights.entries()) {
    if (shown[index] === light) continue;
    shown[index] = light;
    faces.setColorAt(index, LIGHT_COLOURS[light]);
    changed = true;
  }
  if (changed && faces.instanceColor) faces.instanceColor.needsUpdate = true;
}
