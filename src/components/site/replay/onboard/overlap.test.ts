import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  ConeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Object3D,
  Vector3,
} from 'three';
import { circuitForRace } from '@/data/circuit-for-race';
import { CIRCUITS } from '@/data/circuits';
import { GARAGE_STRETCH } from '@/data/pit-garages';
import { addBarriers, planTrackside } from './barriers';
import { addDressing } from './dressing';
import { buildMarshalPanels } from './marshal-panels';
import { buildGarages } from './scenery';
import { PIT_LANE, pointsOf, workingLaneAt } from './surfaces';
import { type TrackModel, sideways, trackModel } from './track';
import { inRange } from './trackside';

/**
 * Nothing the Onboard view stands beside the track may stand on it: no barrier, building,
 * grandstand, tree, garage or marshal panel on the asphalt of any part of the lap, and no pit lane
 * across it but where it leaves and rejoins the lap. Measured on the footprints of the meshes the
 * scene is built from, against the lap's centreline, independently of how they were placed.
 */

/** How far beyond the track's edge a footprint must stay, in metres. */
const MARGIN_M = 0.5;
/** Only what stands this low over the lap counts: a gantry's beam or a bridge passes over it. */
const HEADROOM_M = 3;
/** Where the pit lane meets the lap: the stretch beside it and this far past either end, in metres. */
const PIT_JOIN_M = 60;
/** The grid the lap's segments are filed in, in metres. */
const CELL_M = 20;

/** Where on the lap's asphalt a point stands, as a lap fraction; none when it is off it. */
function lapSurface(track: TrackModel) {
  const { lap } = track;
  const n = lap.x.length;
  const reach = track.width / 2 + MARGIN_M;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  for (let index = 0; index < n; index++) {
    const next = (index + 1) % n;
    const cells = new Set<string>();
    for (const at of [index, next]) {
      const cx = Math.floor(lap.x[at]! / CELL_M);
      const cz = Math.floor(lap.z[at]! / CELL_M);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) cells.add(key(cx + dx, cz + dz));
    }
    for (const cell of cells) grid.set(cell, [...(grid.get(cell) ?? []), index]);
  }
  return (x: number, z: number, y: number): number | null => {
    for (const index of grid.get(key(Math.floor(x / CELL_M), Math.floor(z / CELL_M))) ?? []) {
      const next = (index + 1) % n;
      const ax = lap.x[index]!;
      const az = lap.z[index]!;
      const dx = lap.x[next]! - ax;
      const dz = lap.z[next]! - az;
      const length2 = dx * dx + dz * dz;
      const t =
        length2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) >= reach) continue;
      const height = lap.y ? lap.y[index]! + (lap.y[next]! - lap.y[index]!) * t : 0;
      if (Math.abs(y - height) > HEADROOM_M) continue;
      return (lap.s[index]! + (lap.s[index + 1]! - lap.s[index]!) * t) / lap.length;
    }
    return null;
  };
}

/** The low points of every mesh in `group`: an instance's base, a merged mesh's vertices. */
function footprints(group: Object3D, label: (mesh: Mesh) => string) {
  const found: { object: string; points: Vector3[] }[] = [];
  const matrix = new Matrix4();
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const points: Vector3[] = [];
    if (object instanceof InstancedMesh) {
      object.geometry.computeBoundingBox();
      const { min, max } = object.geometry.boundingBox!;
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, matrix);
        for (let u = 0; u <= 4; u++) {
          for (let w = 0; w <= 4; w++) {
            const x = min.x + ((max.x - min.x) * u) / 4;
            const z = min.z + ((max.z - min.z) * w) / 4;
            points.push(new Vector3(x, min.y, z).applyMatrix4(matrix));
          }
        }
      }
    } else {
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        points.push(new Vector3().fromBufferAttribute(positions, index));
      }
    }
    found.push({ object: label(object), points });
  });
  return found;
}

const dressingLabel = (mesh: Mesh) => {
  if (!(mesh instanceof InstancedMesh)) return 'gantry';
  if (mesh.geometry instanceof ConeGeometry) return 'tree';
  if (mesh.geometry instanceof BoxGeometry) {
    return mesh.geometry.parameters.width === 1 ? 'building' : 'gantry light';
  }
  return 'grandstand';
};

/** Every object of `circuitName`'s scenery on the lap's asphalt, with the lap fractions it hits. */
function overlaps(circuitName: string): Map<string, number[]> {
  const circuit = circuitForRace(circuitName);
  const track = trackModel(circuit);
  const plan = planTrackside(track);
  const barriers = new Group();
  addBarriers(barriers, track, plan);
  const dressing = new Group();
  addDressing(dressing, track, plan);
  const slots = 11;
  const slot = (GARAGE_STRETCH.to - GARAGE_STRETCH.from) / slots;
  const garages = buildGarages(
    track,
    Array.from({ length: slots }, (_, index) => ({
      share: GARAGE_STRETCH.from + slot * (index + 0.5),
      colour: '#e8002d',
    })),
  );
  const objects = [
    ...footprints(barriers, () => 'barrier or pit wall'),
    ...footprints(dressing, dressingLabel),
    ...footprints(garages, () => 'garage'),
    ...footprints(buildMarshalPanels(track, plan).group, () => 'marshal panel'),
  ];

  const onLap = lapSurface(track);
  const hits = new Map<string, number[]>();
  const hit = (object: string, at: number) => hits.set(object, [...(hits.get(object) ?? []), at]);
  for (const { object, points } of objects) {
    for (const point of points) {
      const at = onLap(point.x, point.z, point.y);
      if (at !== null) hit(object, at);
    }
  }

  // The pit lane's asphalt, across its full width, but on the stretch of the lap it runs beside.
  const { lap, pit } = track;
  const join = PIT_JOIN_M / lap.length;
  const beside = { from: circuit.pit.entry - join, to: circuit.pit.exit + 1 + join };
  const g = plan.garageSide;
  for (const [index, point] of pointsOf(pit).entries()) {
    const working = PIT_LANE.working * workingLaneAt(pit.s[index]! / pit.length);
    for (const across of [-PIT_LANE.fast, 0, PIT_LANE.fast, PIT_LANE.fast + working]) {
      const [x, z] = sideways(point.x, point.z, point.heading, g * across);
      const at = onLap(x, z, point.y);
      if (at !== null && !inRange(beside, at, 1)) hit('pit lane', at);
    }
  }
  // The pit lane's side is picked so that every team's garage stands clear of the lap.
  const standing = (garages.children[0] as InstancedMesh).count;
  if (standing < slots) hits.set(`${slots - standing} of ${slots} garages left out`, []);
  return hits;
}

describe('the Onboard scenery', () => {
  it('keeps off the lap on every circuit', () => {
    const found: string[] = [];
    for (const circuit of CIRCUITS) {
      for (const [object, at] of overlaps(circuit.name)) {
        const shares = [...new Set(at.map((share) => share.toFixed(2)))].sort();
        found.push(`${circuit.id}: ${object}${at.length > 0 ? ` at ${shares.join(', ')}` : ''}`);
      }
    }
    expect(found).toEqual([]);
    // Every circuit's whole scenery, elevation included: seconds under a full parallel run.
  }, 60_000);
});
