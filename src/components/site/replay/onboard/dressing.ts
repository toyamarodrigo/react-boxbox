/**
 * What stands around the Onboard view's track: the start/finish gantry and its lights, generic
 * grandstands along the main straight, trees further out on a permanent circuit and generic
 * buildings behind a street circuit's walls. All instanced or merged; nothing here is a real
 * landmark, a logo or a name.
 */
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  type Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import type { Plan } from './barriers';
import { MeshBuilder } from './mesh-builder';
import { KERB, lapPoint } from './surfaces';
import { random } from './textures';
import { type TrackModel, angleDelta, sideways } from './track';
import { type Side, lapGap, trackIndex } from './trackside';

const GANTRY_COLOUR = new Color('#2b2d31');
const STAND = { length: 32, depth: 14, every: 36, from: -320, to: 180 } as const;
/** How far a building is sunk into the ground, in metres. */
const BUILDING_FOOTING_M = 2;
const FACADES = ['#c9c1b2', '#a9b0b6', '#d8d3c8', '#8e8a83', '#b7a99a', '#9fa7a0'].map(
  (hex) => new Color(hex),
);

export function addDressing(group: Group, track: TrackModel, plan: Plan) {
  const stands = addGrandstands(group, track, plan);
  addGantry(group, track);
  if (track.street) addBuildings(group, track, plan, stands);
  else addTrees(group, track);
}

/**
 * Where something standing at `x`, `z` starts: on rising ground, `sunk` metres into it, so it
 * never floats at its lower side (the ground hides the rest); on a flat circuit, at 0, since its
 * ground hides nothing.
 */
const footingOf =
  (track: TrackModel) =>
  (x: number, z: number, sunk: number): number =>
    track.elevated ? track.groundAt(x, z) - sunk : 0;

/** The lap's sample nearest `metres` along it, in its own metres. */
const sampleAt = (track: TrackModel, metres: number) => {
  const n = track.lap.x.length;
  return ((Math.round((metres / track.lap.length) * n) % n) + n) % n;
};

/**
 * The gantry over the start/finish line: a post either side and a beam across, with a panel of
 * five pairs of red lights facing the cars that come up to the line.
 */
function addGantry(group: Group, track: TrackModel) {
  const half = track.width / 2;
  const point = lapPoint(track.lap, 0);
  const { heading } = point;
  const span = half + KERB.width + 1.2;
  const frame = new MeshBuilder();
  for (const side of [1, -1] as const) {
    const [x, z] = sideways(point.x, point.z, heading, side * span);
    frame.box(x, point.y, z, heading, [0.7, 7.6, 0.7], GANTRY_COLOUR);
  }
  frame.box(point.x, point.y + 6.4, point.z, heading, [1.1, 1.3, span * 2 + 0.7], GANTRY_COLOUR);
  // The light panel hangs in front of the beam, towards the oncoming cars.
  const back = (along: number) =>
    [point.x - Math.cos(heading) * along, point.z - Math.sin(heading) * along] as const;
  const [px, pz] = back(0.7);
  frame.box(px, point.y + 5.6, pz, heading, [0.3, 1.2, 6], new Color('#151618'));
  group.add(
    new Mesh(frame.geometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })),
  );

  const lights = new InstancedMesh(
    new BoxGeometry(0.06, 0.34, 0.34),
    // Unlit and past tone mapping, so the lights stay a bright red in any light.
    new MeshBasicMaterial({ color: '#ff2414', toneMapped: false }),
    10,
  );
  const holder = new Object3D();
  const [lx, lz] = back(0.88);
  for (let column = 0; column < 5; column++) {
    for (let row = 0; row < 2; row++) {
      const [x, z] = sideways(lx, lz, heading, (column - 2) * 1.1);
      holder.position.set(x, point.y + 5.95 + row * 0.5, z);
      holder.rotation.set(0, -heading, 0);
      holder.updateMatrix();
      lights.setMatrixAt(column * 2 + row, holder.matrix);
    }
  }
  group.add(lights);
}

/** One grandstand, its seats facing local `+z`: stepped tiers, a back wall and a roof. */
function grandstandGeometry() {
  const { length, depth } = STAND;
  const unit = new MeshBuilder();
  const concrete = new Color('#b3b1ab');
  const seats = [new Color('#5d7192'), new Color('#4f6382')];
  for (let tier = 0; tier < 6; tier++) {
    const z = depth / 2 - (tier + 0.5) * 2;
    unit.box(0, 0, z, 0, [length, 0.9 + tier * 1.1, 2], seats[tier % 2]!);
  }
  unit.box(0, 0, -depth / 2 + 0.6, 0, [length, 10, 0.6], concrete);
  unit.box(0, 10, -0.5, 0, [length + 1, 0.35, depth + 2], new Color('#e4e4e2'));
  for (const along of [-1, 0, 1]) {
    unit.box(along * (length / 2 - 0.5), 0, -depth / 2 + 1.4, 0, [0.4, 10, 0.4], concrete);
  }
  return unit.geometry();
}

type Footprint = { x: number; z: number; radius: number };

/**
 * Grandstands along the main straight, opposite the pit lane, behind the barrier: wherever the
 * straight runs straight and a stand clears the rest of the lap and the pit lane.
 */
function addGrandstands(group: Group, track: TrackModel, plan: Plan): Footprint[] {
  const { lap, pit } = track;
  const side: Side = plan.pitSide === 1 ? -1 : 1;
  const lapIndex = trackIndex([lap]);
  const pitIndex = trackIndex([pit]);
  const placed: Footprint[] = [];
  const holder = new Object3D();
  const matrices: Matrix4[] = [];
  for (let metres = STAND.from; metres <= STAND.to; metres += STAND.every) {
    const before = lapPoint(lap, metres - STAND.length / 2);
    const after = lapPoint(lap, metres + STAND.length / 2);
    if (Math.abs(angleDelta(before.heading, after.heading)) > 0.12) continue;
    const point = lapPoint(lap, metres);
    const barrier = Math.abs(plan.barrier[side][sampleAt(track, metres)]!);
    const out = side * (barrier + 4 + STAND.depth / 2);
    const [x, z] = sideways(point.x, point.z, point.heading, out);
    const radius = Math.hypot(STAND.length, STAND.depth) / 2;
    const s = ((metres % lap.length) + lap.length) % lap.length;
    const onLap = lapIndex.near(
      x,
      z,
      Math.max(radius, Math.abs(out) - 1),
      (_, at) => lapGap(at, s, lap.length) < 60,
    );
    if (onLap || pitIndex.near(x, z, radius + 6)) continue;
    // On the lower end's ground, so neither end floats on a sloping straight.
    holder.position.set(x, Math.min(before.y, after.y), z);
    holder.rotation.set(0, -point.heading + (side === 1 ? 0 : Math.PI), 0);
    holder.updateMatrix();
    matrices.push(holder.matrix.clone());
    placed.push({ x, z, radius });
  }
  if (matrices.length === 0) return placed;
  const stands = new InstancedMesh(
    grandstandGeometry(),
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    matrices.length,
  );
  for (const [index, matrix] of matrices.entries()) stands.setMatrixAt(index, matrix);
  group.add(stands);
  return placed;
}

/** Trees well away from the track, seeded by the lap's length so each circuit keeps its own. */
function addTrees(group: Group, track: TrackModel) {
  const { lap, pit, centre, radius } = track;
  const footing = footingOf(track);
  const index = trackIndex([lap, pit]);
  const next = random(Math.round(lap.length));
  const wanted = 1600;
  const trees = new InstancedMesh(
    new ConeGeometry(2.6, 9, 7),
    new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
    wanted,
  );
  const matrix = new Matrix4();
  const shade = new Color();
  let placed = 0;
  for (let attempt = 0; attempt < wanted * 6 && placed < wanted; attempt++) {
    const angle = next() * Math.PI * 2;
    const distance = Math.sqrt(next()) * (radius + 600);
    const x = centre.x + Math.cos(angle) * distance;
    const z = centre.z + Math.sin(angle) * distance;
    if (index.near(x, z, 55 + track.width / 2)) continue;
    const size = 0.7 + next() * 0.8;
    matrix.makeScale(size, size, size).setPosition(x, footing(x, z, 0.3) + 4.5 * size, z);
    trees.setMatrixAt(placed, matrix);
    trees.setColorAt(placed, shade.setHSL(0.27 + next() * 0.06, 0.45, 0.17 + next() * 0.08));
    placed++;
  }
  trees.count = placed;
  group.add(trees);
}

/**
 * Generic blocks behind a street circuit's walls, two rows deep on both sides, wherever one
 * clears the lap, the pit lane and the grandstands.
 */
function addBuildings(group: Group, track: TrackModel, plan: Plan, stands: readonly Footprint[]) {
  const { lap, pit } = track;
  const lapIndex = trackIndex([lap]);
  const pitIndex = trackIndex([pit]);
  const footing = footingOf(track);
  const next = random(Math.round(lap.length) + 7);
  const matrices: Matrix4[] = [];
  const colours: Color[] = [];
  const holder = new Object3D();
  for (const side of [1, -1] as const) {
    for (let metres = 0; metres < lap.length; metres += 24) {
      const point = lapPoint(lap, metres);
      let set = Math.abs(plan.barrier[side][sampleAt(track, metres)]!) + 4;
      for (let row = 0; row < 2; row++) {
        const width = 14 + next() * 12;
        const depth = 12 + next() * 12;
        const height = (row === 0 ? 9 : 16) + next() * (row === 0 ? 22 : 34);
        const out = side * (set + depth / 2);
        set += depth + 8;
        const [x, z] = sideways(point.x, point.z, point.heading, out);
        const radius = Math.hypot(width, depth) / 2;
        const clear =
          !lapIndex.near(
            x,
            z,
            Math.max(radius, Math.abs(out) - 1),
            (_, at) => lapGap(at, metres, lap.length) < radius * 2 + 20,
          ) &&
          !pitIndex.near(x, z, radius + 8) &&
          stands.every((stand) => Math.hypot(stand.x - x, stand.z - z) > stand.radius + radius);
        if (!clear) continue;
        const base = footing(x, z, BUILDING_FOOTING_M);
        holder.position.set(x, base, z);
        holder.rotation.set(0, -point.heading, 0);
        holder.scale.set(width, height - base + track.groundAt(x, z), depth);
        holder.updateMatrix();
        matrices.push(holder.matrix.clone());
        colours.push(FACADES[Math.floor(next() * FACADES.length)]!);
      }
    }
  }
  if (matrices.length === 0) return;
  const box = new BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const buildings = new InstancedMesh(
    box,
    new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    matrices.length,
  );
  for (const [index, matrix] of matrices.entries()) {
    buildings.setMatrixAt(index, matrix);
    buildings.setColorAt(index, colours[index]!);
  }
  group.add(buildings);
}
