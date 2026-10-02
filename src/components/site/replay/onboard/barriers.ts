/**
 * Where the Onboard view's barriers stand and what they are: Armco set back across grass on a
 * permanent circuit, tyre walls behind the gravel at the corners, concrete walls with catch
 * fencing right at the edge of a street circuit, and the pit wall between the pit lane and the
 * track. A barrier never cuts across another part of the lap or the pit lane: it moves in, or
 * leaves a gap.
 */
import {
  BoxGeometry,
  Color,
  type Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { MeshBuilder } from './mesh-builder';
import { KERB, PIT_LANE, type SurfacePlan, pointsOf } from './surfaces';
import { fenceTexture } from './textures';
import { type TrackModel, type TrackPoint, sideways } from './track';
import { type Side, corners, kerbRanges, lapGap, runoffWeight, trackIndex } from './trackside';

const BARRIER_COLOURS = {
  armco: new Color('#a9adb3'),
  tyres: new Color('#26272a'),
  concrete: new Color('#c4c2bb'),
  fence: new Color('#ffffff'),
} as const;

/**
 * A permanent circuit's barrier, in metres beyond the kerb: its set-back on a straight and the
 * extra a corner's outside gets for its gravel trap.
 */
const SET_BACK = { straight: 9, corner: 14, least: 1.5 } as const;

/** A street circuit's wall, its middle in metres beyond the kerb. */
const STREET_WALL = 0.4;

/** How tall the catch fence stands above a wall, in metres. */
const FENCE_TOP = 4.2;

export type Plan = SurfacePlan & {
  /** Whether a barrier stands at each lap segment, per side. */
  keep: Record<Side, Uint8Array>;
  /** Which side of the lap the pit lane is on. */
  pitSide: Side;
};

/** The pit lane's side away from the lap, and the lap's side towards the pit lane. */
export function sidesOf({ lap, pit }: TrackModel): { garageSide: Side; pitSide: Side } {
  const sample = Math.floor(pit.x.length / 2);
  const px = pit.x[sample]!;
  const pz = pit.z[sample]!;
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lap.x.length; index++) {
    const distance = Math.hypot(lap.x[index]! - px, lap.z[index]! - pz);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  }
  const dx = px - lap.x[nearest]!;
  const dz = pz - lap.z[nearest]!;
  const [plx, plz] = sideways(0, 0, pit.heading[sample]!, 1);
  const [llx, llz] = sideways(0, 0, lap.heading[nearest]!, 1);
  return {
    garageSide: dx * plx + dz * plz >= 0 ? 1 : -1,
    pitSide: dx * llx + dz * llz >= 0 ? 1 : -1,
  };
}

/** A moving average round a closed array, `reach` samples either side. */
function smoothRound(values: Float64Array, reach: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  for (let index = 0; index < n; index++) {
    let sum = 0;
    for (let offset = -reach; offset <= reach; offset++) sum += values[(index + offset + n) % n]!;
    out[index] = sum / (2 * reach + 1);
  }
  return out;
}

/** Where the barriers stand, the gravel lies and the kerbs run on this circuit. */
export function planTrackside(track: TrackModel): Plan {
  const { lap, pit, street } = track;
  const half = track.width / 2;
  const n = lap.x.length;
  const found = corners(lap);
  const lapIndex = trackIndex([lap]);
  const pitIndex = trackIndex([pit]);
  const { garageSide, pitSide } = sidesOf(track);

  const barrier = { 1: new Float64Array(n), [-1]: new Float64Array(n) } as Record<
    Side,
    Float64Array
  >;
  const gravel = { 1: new Uint8Array(n), [-1]: new Uint8Array(n) } as Record<Side, Uint8Array>;
  const keep = { 1: new Uint8Array(n), [-1]: new Uint8Array(n) } as Record<Side, Uint8Array>;
  const edge = half + KERB.width;

  /** True when a barrier `offset` beside sample `index` would stand on another part of the lap. */
  const blocked = (index: number, offset: number) => {
    const [x, z] = sideways(lap.x[index]!, lap.z[index]!, lap.heading[index]!, offset);
    const s = lap.s[index]!;
    const window = Math.abs(offset) * 1.6 + 12;
    return lapIndex.near(x, z, half + 2.5, (_, at) => lapGap(at, s, lap.length) < window);
  };

  for (const side of [1, -1] as const) {
    const wanted = new Float64Array(n);
    for (let index = 0; index < n; index++) {
      const s = lap.s[index]!;
      const weight = street ? 0 : runoffWeight(found, lap.length, s, side);
      gravel[side][index] = weight > 0.5 ? 1 : 0;
      let beyond = street
        ? STREET_WALL
        : SET_BACK.straight + (SET_BACK.corner - SET_BACK.straight + 6) * weight;
      // Move in while the barrier would stand on another part of the lap.
      while (beyond > SET_BACK.least && blocked(index, side * (edge + beyond))) beyond -= 1.5;
      wanted[index] = edge + beyond;
    }
    const smoothed = street ? wanted : smoothRound(wanted, 3);
    for (let index = 0; index < n; index++) {
      const offset = side * smoothed[index]!;
      barrier[side][index] = offset;
      const [x, z] = sideways(lap.x[index]!, lap.z[index]!, lap.heading[index]!, offset);
      // A gap where the pit lane leaves or rejoins, and alongside it the pit wall does the work.
      const nearPit = pitIndex.near(x, z, side === pitSide ? 30 : PIT_LANE.fast + 4);
      keep[side][index] = !nearPit && !blocked(index, offset) ? 1 : 0;
    }
  }
  return { barrier, gravel, keep, kerbs: kerbRanges(found), garageSide, pitSide };
}

/** A post every so often along a barrier, for the fence and the Armco to hang on. */
type Post = { x: number; z: number; y: number; height: number };

/** Adds every barrier of the circuit, one merged mesh, plus the fences and their posts. */
export function addBarriers(group: Group, track: TrackModel, plan: Plan, anisotropy = 1) {
  const { lap, pit, street } = track;
  const half = track.width / 2;
  const points = pointsOf(lap);
  const walls = new MeshBuilder();
  const fence = new MeshBuilder();
  const posts: Post[] = [];
  const addPosts = (
    line: readonly TrackPoint[],
    offset: (index: number) => number,
    keep: (segment: number) => boolean,
    every: number,
    height: number,
  ) => {
    for (let index = 0; index < line.length; index += every) {
      if (!keep(index)) continue;
      const point = line[index]!;
      const [x, z] = sideways(point.x, point.z, point.heading, offset(index));
      posts.push({ x, z, y: point.y, height });
    }
  };

  for (const side of [1, -1] as const) {
    const offset = (index: number) => plan.barrier[side][index]!;
    const kept = (segment: number) => plan.keep[side][segment] === 1;
    if (street) {
      walls.wall(points, {
        offset,
        height: 1.1,
        thickness: 0.6,
        colour: BARRIER_COLOURS.concrete,
        keep: kept,
        closed: true,
      });
      const fenceAt = (index: number) => offset(index) + side * 0.1;
      fence.curtain(points, {
        offset: fenceAt,
        base: 1.1,
        top: FENCE_TOP,
        colour: BARRIER_COLOURS.fence,
        keep: kept,
        closed: true,
        tile: 0.5,
      });
      addPosts(points, fenceAt, kept, 2, FENCE_TOP);
      continue;
    }
    const tyres = (segment: number) => kept(segment) && plan.gravel[side][segment] === 1;
    const armco = (segment: number) => kept(segment) && plan.gravel[side][segment] === 0;
    // Tyres a little in front of where the Armco would be, stacked four high.
    walls.wall(points, {
      offset: (index) => offset(index) - side * 0.6,
      height: 1,
      thickness: 1.1,
      colour: BARRIER_COLOURS.tyres,
      keep: tyres,
      closed: true,
    });
    walls.wall(points, {
      offset,
      base: 0.45,
      height: 0.85,
      thickness: 0.12,
      colour: BARRIER_COLOURS.armco,
      keep: armco,
      closed: true,
    });
    addPosts(points, (index) => offset(index) + side * 0.12, armco, 1, 0.8);
  }

  // The pit wall between the pit lane and the track, wherever it stands clear of the lap.
  const pitPoints = pointsOf(pit);
  const lapIndex = trackIndex([lap]);
  const wallAt = () => -plan.garageSide * (PIT_LANE.fast + 1);
  const clear = pitPoints.map((point, index) => {
    const [x, z] = sideways(point.x, point.z, point.heading, wallAt());
    return index > 0 && index < pitPoints.length - 2 && !lapIndex.near(x, z, half + 1.5);
  });
  const pitKept = (segment: number) => clear[segment]! && clear[segment + 1]!;
  walls.wall(pitPoints, {
    offset: wallAt,
    height: 1.2,
    thickness: 0.7,
    colour: BARRIER_COLOURS.concrete,
    keep: pitKept,
  });
  fence.curtain(pitPoints, {
    offset: wallAt,
    base: 1.2,
    top: FENCE_TOP,
    colour: BARRIER_COLOURS.fence,
    keep: pitKept,
    tile: 0.5,
  });
  addPosts(pitPoints, wallAt, pitKept, 2, FENCE_TOP);

  group.add(
    new Mesh(
      walls.geometry(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 }),
    ),
  );
  if (!fence.empty) {
    const map = fenceTexture(anisotropy);
    group.add(
      new Mesh(
        fence.geometry(),
        new MeshStandardMaterial({
          vertexColors: true,
          map,
          alphaTest: 0.5,
          roughness: 0.6,
          metalness: 0.4,
        }),
      ),
    );
  }
  if (posts.length > 0) {
    const mesh = new InstancedMesh(
      new BoxGeometry(0.1, 1, 0.1),
      new MeshStandardMaterial({ color: '#8d9197', roughness: 0.6, metalness: 0.4 }),
      posts.length,
    );
    const matrix = new Matrix4();
    for (const [index, post] of posts.entries()) {
      matrix.makeScale(1, post.height, 1).setPosition(post.x, post.y + post.height / 2, post.z);
      mesh.setMatrixAt(index, matrix);
    }
    group.add(mesh);
  }
}
