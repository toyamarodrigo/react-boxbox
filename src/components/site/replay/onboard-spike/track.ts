/**
 * SPIKE (issue #9), throwaway. The circuit outline as a smooth centreline in metres, for the
 * Onboard view.
 *
 * World axes: `x` is the SVG x and `z` the SVG y, both scaled to metres with
 * `lengthM / pathLength`; `y` is up. Seen from above, that keeps the outline the way round the
 * Track Map draws it, so corners turn the same way.
 */
import type { Circuit } from '../../../../data/circuits';

/** Uniform samples along a line, in metres. */
export type Centreline = {
  x: Float64Array;
  z: Float64Array;
  /** Distance from the first sample. A closed line has one more entry: its length. */
  s: Float64Array;
  /** Direction of travel, `atan2(dz, dx)`, in radians. */
  heading: Float64Array;
  length: number;
  closed: boolean;
};

export type TrackModel = {
  lap: Centreline;
  pit: Centreline;
  /** The middle of the outline and how far it reaches, for the ground and the scenery. */
  centre: { x: number; z: number };
  radius: number;
};

/** About 4 m between samples: enough for the tightest chicane, cheap to search per frame. */
const SAMPLE_STEP_M = 4;

type Point = [number, number];

/** The outlines are `M x y L x y … [Z]`, so every number is one half of a point. */
function parsePath(d: string): Point[] {
  const numbers = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const points: Point[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push([numbers[index]!, numbers[index + 1]!]);
  }
  return points;
}

function polylineLength(points: readonly Point[], closed: boolean): number {
  let length = 0;
  const segments = closed ? points.length : points.length - 1;
  for (let index = 0; index < segments; index++) {
    const [ax, az] = points[index]!;
    const [bx, bz] = points[(index + 1) % points.length]!;
    length += Math.hypot(bx - ax, bz - az);
  }
  return length;
}

/** Evenly spaced points along a polyline. */
function resample(points: readonly Point[], closed: boolean, step: number): Point[] {
  const total = polylineLength(points, closed);
  const count = Math.max(2, Math.round(total / step));
  const spacing = total / (closed ? count : count - 1);
  const out: Point[] = [];
  let segment = 0;
  let segmentStart = 0;
  const segments = closed ? points.length : points.length - 1;
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
function smooth(points: readonly Point[], closed: boolean, radius: number, passes = 2): Point[] {
  let current = points.slice();
  const n = current.length;
  for (let pass = 0; pass < passes; pass++) {
    const next: Point[] = [];
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

function centreline(points: readonly Point[], closed: boolean): Centreline {
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
  return { x, z, s, heading, length: s[s.length - 1]!, closed };
}

/** The difference `b - a` between two angles, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let delta = (b - a) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta <= -Math.PI) delta += 2 * Math.PI;
  return delta;
}

export type TrackPoint = { x: number; z: number; heading: number };

/** The place `distance` metres along a line; a closed line wraps, an open one clamps. */
export function pointAt(line: Centreline, distance: number): TrackPoint {
  const { s, x, z, heading, length, closed } = line;
  const n = x.length;
  const at = closed
    ? ((distance % length) + length) % length
    : Math.min(Math.max(distance, 0), length);
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

/** The circuit as the Onboard view drives it: the lap and the pit lane, in metres. */
export function trackModel(circuit: Circuit): TrackModel {
  const outline = parsePath(circuit.d);
  const first = outline[0];
  const last = outline[outline.length - 1];
  if (first && last && outline.length > 2 && first[0] === last[0] && first[1] === last[1]) {
    outline.pop();
  }
  const metres = circuit.lengthM / polylineLength(outline, true);
  const scale = (points: Point[]): Point[] => points.map(([px, pz]) => [px * metres, pz * metres]);

  const lap = centreline(smooth(resample(scale(outline), true, SAMPLE_STEP_M), true, 3), true);
  const pit = centreline(
    smooth(resample(scale(parsePath(circuit.pit.d)), false, SAMPLE_STEP_M), false, 2),
    false,
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
    centre: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2,
  };
}
