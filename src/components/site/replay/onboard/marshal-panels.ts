/**
 * The marshal light panels of the Onboard view: generic LED boards on posts at regular intervals
 * round the lap, on top of the barrier, each turned to face the cars coming towards it. No text
 * and no logos. Two draw calls for the whole circuit: the housings and posts in one merged mesh,
 * the lit faces as one instanced mesh whose colours `setMarshalLights` changes as the flags do.
 */
import {
  Color,
  Group,
  InstancedMesh,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import type { MarshalLight } from '@/data/onboard-frame';
import { type Plan, planTrackside } from './barriers';
import { MeshBuilder } from './mesh-builder';
import { pointsOf } from './surfaces';
import { type TrackModel, sideways } from './track';
import type { Side } from './trackside';

/** About how far apart the panels stand along the lap, in metres. */
export const MARSHAL_PANEL_SPACING_M = 275;

/**
 * A panel's size in metres (its face, the housing's depth behind it), how high its bottom edge
 * stands off the ground, how far in front of the barrier's line it stands, and how far it is
 * turned from facing straight back up the track towards the track, in radians.
 */
const PANEL = { width: 1, height: 0.7, depth: 0.16, base: 1.6, inset: 0.35, turn: 0.35 } as const;

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

/** Where the panel nearest sample `wanted` can stand: a sample and a side with a barrier. */
function placeFor(plan: Plan, wanted: number, n: number): { index: number; side: Side } | null {
  // Away from the pit lane first, where the pit wall is not in the way.
  const sides: Side[] = [plan.pitSide === 1 ? -1 : 1, plan.pitSide];
  for (let step = 0; step <= 10; step++) {
    for (const index of step === 0 ? [wanted] : [wanted + step, wanted - step]) {
      const at = ((index % n) + n) % n;
      const side = sides.find((candidate) => plan.keep[candidate][at] === 1);
      if (side !== undefined) return { index: at, side };
    }
  }
  return null;
}

/** The circuit's marshal light panels, every one dark. */
export function buildMarshalPanels(track: TrackModel, plan = planTrackside(track)): MarshalPanels {
  const { lap } = track;
  const n = lap.x.length;
  const points = pointsOf(lap);
  const count = Math.max(3, Math.round(lap.length / MARSHAL_PANEL_SPACING_M));
  const housings = new MeshBuilder();
  const holder = new Object3D();
  const matrices: Matrix4[] = [];
  const shares: number[] = [];

  for (let panel = 0; panel < count; panel++) {
    const place = placeFor(plan, Math.floor(((panel + 0.5) / count) * n), n);
    if (!place) continue;
    const { index, side } = place;
    const point = points[index]!;
    const out = plan.barrier[side][index]! - side * PANEL.inset;
    const [x, z] = sideways(point.x, point.z, point.heading, out);
    // Facing back up the track at the cars coming, turned a little towards the track.
    const [tx, tz] = sideways(0, 0, point.heading, -side);
    const nx = -Math.cos(point.heading) * Math.cos(PANEL.turn) + tx * Math.sin(PANEL.turn);
    const nz = -Math.sin(point.heading) * Math.cos(PANEL.turn) + tz * Math.sin(PANEL.turn);
    const facing = Math.atan2(nz, nx);
    housings.box(x, point.y, z, facing, [0.12, PANEL.base, 0.12], HOUSING);
    housings.box(
      x,
      point.y + PANEL.base - 0.08,
      z,
      facing,
      [PANEL.depth, PANEL.height + 0.16, PANEL.width + 0.16],
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
  group.add(
    new Mesh(
      housings.geometry(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }),
    ),
  );
  const faces = new InstancedMesh(
    new PlaneGeometry(PANEL.width, PANEL.height),
    new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
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
