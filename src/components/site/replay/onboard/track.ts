/**
 * The circuit as the Onboard view drives it: the lap and the pit lane as smooth centrelines in
 * metres. No three.js and no race logic here, only geometry.
 *
 * World axes: `x` is the SVG x and `z` the SVG y, both scaled to metres by the lap's official
 * length over its drawn length; `y` is up. Seen from above, that keeps the outline the way round
 * the Track Map draws it, so corners turn the same way.
 */
import type { ReplayCircuit } from '@/data/circuit-for-race';
import { type OutlinePoint, outlinePoints, polylineLength } from '@/lib/svg-outline';

/** Uniform samples along a line, in metres. */
export type Centreline = {
  x: Float64Array;
  z: Float64Array;
  /** Distance from the first sample. A closed line has one more entry: its length. */
  s: Float64Array;
  /** Direction of travel, `atan2(dz, dx)`, in radians. */
  heading: Float64Array;
  length: number;
  /**
   * The length the onboard frame measures this line by. Smoothing shortens a line a little, so
   * a place in the frame's metres is read at the same share of this line.
   */
  nominal: number;
  closed: boolean;
};

export type TrackModel = {
  lap: Centreline;
  pit: Centreline;
  /** Full width of the track, in metres. */
  width: number;
  /** The middle of the outline and how far it reaches, for the ground and the scenery. */
  centre: { x: number; z: number };
  radius: number;
};

/** About 4 m between samples: enough for the tightest chicane, cheap to search per frame. */
const SAMPLE_STEP_M = 4;

/** Evenly spaced points along a polyline. */
function resample(points: readonly OutlinePoint[], closed: boolean, step: number): OutlinePoint[] {
  const total = polylineLength(points, closed);
  const count = Math.max(2, Math.round(total / step));
  const spacing = total / (closed ? count : count - 1);
  const segments = closed ? points.length : points.length - 1;
  const out: OutlinePoint[] = [];
  let segment = 0;
  let segmentStart = 0;
  for (let index = 0; index < count; index++) {
    const wanted = index * spacing;
    for (;;) {
      const [ax, az] = points[segment]!;
      const [bx, bz] = points[(segment + 1) % points.length]!;
      const length = Math.hypot(bx - ax, bz - az);
      if (wanted <= segmentStart + length || segment >= segments - 1) {
        const t = length === 0 ? 0 : Math.min(1, (wanted - segmentStart) / length);
        out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
        break;
      }
      segmentStart += length;
      segment++;
    }
  }
  return out;
}

/** A moving average, run twice: rounds off the kinks between the source's GeoJSON points. */
function smooth(points: readonly OutlinePoint[], closed: boolean, radius: number): OutlinePoint[] {
  let current = points.slice();
  const n = current.length;
  for (let pass = 0; pass < 2; pass++) {
    const next: OutlinePoint[] = [];
    for (let index = 0; index < n; index++) {
      if (!closed && (index < radius || index >= n - radius)) {
        next.push(current[index]!);
        continue;
      }
      let sx = 0;
      let sz = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const [x, z] = current[(index + offset + n) % n]!;
        sx += x;
        sz += z;
      }
      next.push([sx / (2 * radius + 1), sz / (2 * radius + 1)]);
    }
    current = next;
  }
  return current;
}

function centreline(points: readonly OutlinePoint[], closed: boolean, nominal: number): Centreline {
  const n = points.length;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const s = new Float64Array(closed ? n + 1 : n);
  const heading = new Float64Array(n);
  for (let index = 0; index < n; index++) {
    x[index] = points[index]![0];
    z[index] = points[index]![1];
  }
  for (let index = 1; index < s.length; index++) {
    const previous = index - 1;
    const here = index % n;
    s[index] = s[previous]! + Math.hypot(x[here]! - x[previous]!, z[here]! - z[previous]!);
  }
  for (let index = 0; index < n; index++) {
    const before = closed ? (index - 1 + n) % n : Math.max(0, index - 1);
    const after = closed ? (index + 1) % n : Math.min(n - 1, index + 1);
    heading[index] = Math.atan2(z[after]! - z[before]!, x[after]! - x[before]!);
  }
  return { x, z, s, heading, length: s[s.length - 1]!, nominal, closed };
}

/** The difference `b - a` between two angles, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let delta = (b - a) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta <= -Math.PI) delta += 2 * Math.PI;
  return delta;
}

export type TrackPoint = { x: number; z: number; heading: number };

/**
 * The place `metres` along a line, in the onboard frame's metres (see `nominal`); a closed line
 * wraps, an open one clamps.
 */
export function pointAt(line: Centreline, metres: number): TrackPoint {
  const { s, x, z, heading, length, closed } = line;
  const n = x.length;
  const scaled = line.nominal > 0 ? (metres * length) / line.nominal : 0;
  const at = closed ? ((scaled % length) + length) % length : Math.min(Math.max(scaled, 0), length);
  let low = 0;
  let high = s.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (s[middle]! <= at) low = middle;
    else high = middle;
  }
  const span = s[high]! - s[low]!;
  const t = span === 0 ? 0 : (at - s[low]!) / span;
  const a = low % n;
  const b = high % n;
  return {
    x: x[a]! + (x[b]! - x[a]!) * t,
    z: z[a]! + (z[b]! - z[a]!) * t,
    heading: heading[a]! + angleDelta(heading[a]!, heading[b]!) * t,
  };
}

/** The circuit in metres: the lap and the pit lane, each measured as the onboard frame does. */
export function trackModel(circuit: ReplayCircuit): TrackModel {
  const outline = outlinePoints(circuit.d);
  const drawn = polylineLength(outline, true);
  const metres = drawn === 0 ? 1 : circuit.lengthM / drawn;
  const scale = (points: readonly OutlinePoint[]): OutlinePoint[] =>
    points.map(([px, pz]) => [px * metres, pz * metres]);

  const lap = centreline(
    smooth(resample(scale(outline), true, SAMPLE_STEP_M), true, 3),
    true,
    circuit.lengthM,
  );
  const pit = centreline(
    smooth(resample(scale(outlinePoints(circuit.pit.d)), false, SAMPLE_STEP_M), false, 2),
    false,
    circuit.pitLengthM,
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < lap.x.length; index++) {
    minX = Math.min(minX, lap.x[index]!);
    maxX = Math.max(maxX, lap.x[index]!);
    minZ = Math.min(minZ, lap.z[index]!);
    maxZ = Math.max(maxZ, lap.z[index]!);
  }
  return {
    lap,
    pit,
    width: circuit.widthM,
    centre: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2,
  };
}
