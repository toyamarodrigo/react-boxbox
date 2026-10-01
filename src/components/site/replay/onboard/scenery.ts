/**
 * The static scene of the Onboard view, built once per circuit: ground, a flat ribbon of the
 * circuit's width along the centreline, white edge lines, kerbs where the track bends, the pit
 * lane, a start line, trackside boards and trees for a sense of speed. Generic and generated:
 * nothing here is a real landmark.
 *
 * Everything flat lies on the ground and is drawn first, in order, without writing depth, so the
 * layers never flicker against each other however far away they are.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { type Centreline, type TrackModel, angleDelta } from './track';

const GROUND = '#4f7d3c';
const ASPHALT = '#3b3e44';
const KERB_RED = new Color('#c8272d');
const KERB_WHITE = new Color('#f1f1f1');
const GRASS = new Color(GROUND);

/**
 * A strip `inner..outer` metres to the left of a line (negative is right), one quad per segment
 * with its own vertices, so a colour per segment stays crisp.
 */
function band(
  line: Centreline,
  inner: number,
  outer: number,
  colour?: (segment: number) => Color,
): BufferGeometry {
  const n = line.x.length;
  const segments = line.closed ? n : n - 1;
  const positions = new Float32Array(segments * 4 * 3);
  const normals = new Float32Array(segments * 4 * 3);
  const colours = colour ? new Float32Array(segments * 4 * 3) : undefined;
  const indices = new Uint32Array(segments * 6);
  const corner = (sample: number, offset: number, into: number) => {
    const heading = line.heading[sample]!;
    positions[into] = line.x[sample]! - Math.sin(heading) * offset;
    positions[into + 1] = 0;
    positions[into + 2] = line.z[sample]! + Math.cos(heading) * offset;
    normals[into + 1] = 1;
  };
  for (let segment = 0; segment < segments; segment++) {
    const a = segment;
    const b = (segment + 1) % n;
    const base = segment * 4;
    corner(a, inner, base * 3);
    corner(a, outer, (base + 1) * 3);
    corner(b, inner, (base + 2) * 3);
    corner(b, outer, (base + 3) * 3);
    indices.set([base, base + 1, base + 2, base + 1, base + 3, base + 2], segment * 6);
    if (colours && colour) {
      const { r, g, b: blue } = colour(segment);
      for (let vertex = 0; vertex < 4; vertex++) colours.set([r, g, blue], (base + vertex) * 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  if (colours) geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

function flat(geometry: BufferGeometry, material: MeshLambertMaterial, order: number): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = order;
  return mesh;
}

const flatMaterial = (colour: string, vertexColors = false) =>
  new MeshLambertMaterial({ color: colour, vertexColors, depthWrite: false, side: DoubleSide });

/** A small seeded generator, so the trees stand in the same place on every visit. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when the track bends sharper than a 250 m radius around a segment. */
function bends(line: Centreline, segment: number): boolean {
  const n = line.heading.length;
  const turn = Math.abs(
    angleDelta(line.heading[(segment - 3 + n) % n]!, line.heading[(segment + 3) % n]!),
  );
  return turn / ((6 * line.length) / n) > 1 / 250;
}

function nearTrack(track: TrackModel, x: number, z: number, clearance: number): boolean {
  for (const line of [track.lap, track.pit]) {
    for (let index = 0; index < line.x.length; index += 2) {
      if (Math.hypot(line.x[index]! - x, line.z[index]! - z) < clearance) return true;
    }
  }
  return false;
}

export function buildScenery(track: TrackModel): Group {
  const group = new Group();
  const { lap, pit, centre, radius } = track;
  const half = track.width / 2;

  const ground = new Mesh(new PlaneGeometry(1, 1), flatMaterial(GROUND));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set((radius + 2000) * 2, (radius + 2000) * 2, 1);
  ground.position.set(centre.x, 0, centre.z);
  ground.renderOrder = -5;
  group.add(ground);

  group.add(flat(band(pit, -4, 4), flatMaterial('#53565c'), -4));
  group.add(flat(band(lap, -half, half), flatMaterial(ASPHALT), -3));
  const kerb = (segment: number) =>
    bends(lap, segment) ? (segment % 2 === 0 ? KERB_RED : KERB_WHITE) : GRASS;
  const kerbs = flatMaterial('#ffffff', true);
  group.add(flat(band(lap, half, half + 1.2, kerb), kerbs, -2));
  group.add(flat(band(lap, -half - 1.2, -half, kerb), kerbs, -2));
  const line = flatMaterial('#e8e8e8');
  group.add(flat(band(lap, half - 0.5, half - 0.2), line, -1));
  group.add(flat(band(lap, -half + 0.2, -half + 0.5), line, -1));

  const start = new Mesh(new PlaneGeometry(1.2, half * 2), flatMaterial('#ffffff'));
  start.rotation.x = -Math.PI / 2;
  const startHolder = new Object3D();
  startHolder.position.set(lap.x[0]!, 0, lap.z[0]!);
  startHolder.rotation.y = -lap.heading[0]!;
  startHolder.add(start);
  start.renderOrder = -1;
  group.add(startHolder);

  // Boards about every 40 m on both sides, the cue that sells speed from the T-cam.
  const matrix = new Matrix4();
  const holder = new Object3D();
  const boardEvery = 10;
  const boardSamples = Math.floor(lap.x.length / boardEvery);
  const boards = new InstancedMesh(
    new BoxGeometry(3, 1.1, 0.25),
    new MeshLambertMaterial({ color: '#d9dde3' }),
    boardSamples * 2,
  );
  for (let board = 0; board < boardSamples; board++) {
    const sample = board * boardEvery;
    const heading = lap.heading[sample]!;
    for (const side of [1, -1]) {
      const offset = side * (half + 9);
      holder.position.set(
        lap.x[sample]! - Math.sin(heading) * offset,
        0.55,
        lap.z[sample]! + Math.cos(heading) * offset,
      );
      holder.rotation.set(0, -heading, 0);
      holder.updateMatrix();
      boards.setMatrixAt(board * 2 + (side === 1 ? 0 : 1), holder.matrix);
    }
  }
  group.add(boards);

  // Seeded by the lap's length, so each circuit has its own trees and keeps them.
  const next = random(Math.round(lap.length));
  const wanted = 1400;
  const trees = new InstancedMesh(
    new ConeGeometry(2.6, 9, 7),
    new MeshLambertMaterial({ color: '#2f5a2a' }),
    wanted,
  );
  let placed = 0;
  for (let attempt = 0; attempt < wanted * 6 && placed < wanted; attempt++) {
    const angle = next() * Math.PI * 2;
    const distance = Math.sqrt(next()) * (radius + 500);
    const x = centre.x + Math.cos(angle) * distance;
    const z = centre.z + Math.sin(angle) * distance;
    if (nearTrack(track, x, z, 24)) continue;
    const size = 0.7 + next() * 0.8;
    matrix.makeScale(size, size, size).setPosition(x, 4.5 * size, z);
    trees.setMatrixAt(placed++, matrix);
  }
  trees.count = placed;
  group.add(trees);

  return group;
}

/** Frees what `buildScenery` put on the GPU. */
export function disposeScenery(group: Group) {
  group.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      const material = object.material as MeshLambertMaterial | MeshLambertMaterial[];
      for (const item of Array.isArray(material) ? material : [material]) item.dispose();
    }
  });
}
