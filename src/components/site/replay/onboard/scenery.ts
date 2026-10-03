/**
 * The static scene of the Onboard view, built once per circuit: the surfaces (`surfaces.ts`),
 * the barriers (`barriers.ts`) and what stands around them (`dressing.ts`). A permanent circuit
 * gets grass and gravel run-off, Armco and tyre walls, and trees; a street circuit gets concrete
 * walls with catch fencing at the track edge and generic buildings behind. Generic and
 * generated: nothing here is a real landmark. The teams' garages along the pit lane change with
 * the race, so `buildGarages` makes them on their own.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Texture,
} from 'three';
import { addBarriers, planTrackside, sidesOf } from './barriers';
import { type Density, addDressing } from './dressing';
import { PIT_LANE, addSurfaces, groundGrid } from './surfaces';
import { type TrackModel, type TrackPoint, pointAt, sideways } from './track';
import { FOOTPRINT_CLEARANCE_M, footprintClear, trackIndex } from './trackside';

/**
 * The static scene; its textures filter with `anisotropy`, the renderer's maximum, and its
 * trees, grandstands and buildings stand as densely as `density` says (the full scene's by
 * default).
 */
export function buildScenery(track: TrackModel, anisotropy = 1, density?: Density): Group {
  const group = new Group();
  const plan = planTrackside(track);
  const ground = track.elevated ? groundGrid(track, plan) : undefined;
  addSurfaces(group, track, plan, anisotropy, ground);
  addBarriers(group, track, plan, anisotropy);
  addDressing(group, track, plan, density, ground);
  return group;
}

/** One team's garage: its box share along the pit lane (see `garageShares`) and its colour. */
export type Garage = { share: number; colour: string };

/**
 * A garage's size in metres: how deep, how tall and, at most, how wide along the lane; and how
 * far its front stands from the line the cars drive, just behind the working lane.
 */
const GARAGE = {
  depth: 8,
  height: 4.5,
  width: 10.5,
  front: PIT_LANE.fast + PIT_LANE.working + 0.6,
} as const;
const GARAGE_OPENING = '#1d1f23';

/**
 * Generic garages along the pit lane, one per team in its colour, each centred on its team's box
 * so a car stops in front of it: a plain block with a dark opening facing the lane. No logos and
 * no names. They stand on the side of the pit lane away from the lap, and none stands where it
 * would reach onto another part of the lap (`build-circuits.ts` picks the pit lane's side so that
 * none should).
 */
export function buildGarages(track: TrackModel, garages: readonly Garage[]): Group {
  const group = new Group();
  if (garages.length === 0) return group;
  const { pit } = track;
  const side = sidesOf(track).garageSide;
  const shares = garages.map((garage) => garage.share).sort((a, b) => a - b);
  const closest = shares.reduce(
    (gap, share, index) => (index === 0 ? gap : Math.min(gap, share - shares[index - 1]!)),
    1,
  );
  // A little apart, so each reads as one garage.
  const width = Math.min(GARAGE.width, closest * pit.nominal * 0.85);

  const box = new BoxGeometry(1, 1, 1);
  const blocks = new InstancedMesh(
    box,
    new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
    garages.length,
  );
  const openings = new InstancedMesh(
    box.clone(),
    new MeshStandardMaterial({ color: GARAGE_OPENING, roughness: 0.9 }),
    garages.length,
  );
  const holder = new Object3D();
  const place = (
    mesh: InstancedMesh,
    index: number,
    point: TrackPoint,
    out: number,
    size: [number, number, number],
  ) => {
    const [x, z] = sideways(point.x, point.z, point.heading, side * out);
    holder.position.set(x, point.y + size[1] / 2, z);
    holder.rotation.set(0, -point.heading, 0);
    holder.scale.set(...size);
    holder.updateMatrix();
    mesh.setMatrixAt(index, holder.matrix);
  };
  const lapIndex = trackIndex([track.lap]);
  const clearance = track.width / 2 + FOOTPRINT_CLEARANCE_M;
  let index = 0;
  for (const garage of garages) {
    const point = pointAt(pit, garage.share * pit.nominal);
    const [x, z] = sideways(
      point.x,
      point.z,
      point.heading,
      side * (GARAGE.front + GARAGE.depth / 2),
    );
    const footprint = { x, z, heading: point.heading, width, depth: GARAGE.depth };
    if (!footprintClear(lapIndex, footprint, clearance)) continue;
    place(blocks, index, point, GARAGE.front + GARAGE.depth / 2, [
      width,
      GARAGE.height,
      GARAGE.depth,
    ]);
    blocks.setColorAt(index, new Color(garage.colour));
    place(openings, index, point, GARAGE.front - 0.05, [width * 0.8, GARAGE.height * 0.75, 0.2]);
    index++;
  }
  for (const mesh of [blocks, openings]) {
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  group.add(blocks, openings);
  return group;
}

/** Frees what `buildScenery` or `buildGarages` put on the GPU: geometries, materials, textures. */
export function disposeScenery(group: Group) {
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const material = object.material as Material | Material[];
    for (const item of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(item)) {
        if ((value as Texture | null)?.isTexture) (value as Texture).dispose();
      }
      item.dispose();
    }
  });
}
