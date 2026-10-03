/**
 * Where the Onboard view puts things beside the track: the corners found from the lap's
 * curvature, the kerbs at their entry, apex and exit, how far the run-off reaches, and whether a
 * place is clear of the track. Pure geometry on the `track.ts` centrelines, no three.js.
 *
 * A `side` is `1` for the left of travel and `-1` for the right, as `sideways` reads offsets.
 */
import { type Centreline, angleDelta } from './track';

export type Side = 1 | -1;

/** A corner of the lap, in metres along it: `from` < `apex` < `to`, `to` may pass the length. */
export type Corner = { from: number; apex: number; to: number; inside: Side; radius: number };

/** A stretch of kerb along the lap, in metres (`to` may pass the length), on one side. */
export type KerbRange = { from: number; to: number; side: Side };

/** A bend sharper than this radius, in metres, is a corner. */
export const CORNER_RADIUS_M = 250;

/** Samples either side the curvature is measured across, so the outline's kinks average out. */
const CURVATURE_REACH = 3;

/**
 * The lap's curvature at each sample, in 1/m: positive where it turns left, negative right.
 * Turning left the heading falls, since left of travel is `(sin h, −cos h)`.
 */
export function signedCurvature(line: Centreline): Float64Array {
  const n = line.heading.length;
  const step = line.length / n;
  const reach = CURVATURE_REACH;
  const curvature = new Float64Array(n);
  for (let index = 0; index < n; index++) {
    const before = line.heading[(index - reach + n) % n]!;
    const after = line.heading[(index + reach) % n]!;
    curvature[index] = -angleDelta(before, after) / (2 * reach * step);
  }
  return curvature;
}

/** The corners of a closed lap: each run of samples bending sharper than `CORNER_RADIUS_M`. */
export function corners(line: Centreline): Corner[] {
  const curvature = signedCurvature(line);
  const n = curvature.length;
  const step = line.length / n;
  const threshold = 1 / CORNER_RADIUS_M;
  const sign = (index: number): 0 | Side => {
    const value = curvature[index % n]!;
    return Math.abs(value) <= threshold ? 0 : value > 0 ? 1 : -1;
  };
  // Start the scan on a straight sample, so no corner is split where the lap wraps.
  const start = Array.from({ length: n }, (_, index) => index).find((index) => sign(index) === 0);
  if (start === undefined) return [];
  const found: Corner[] = [];
  let index = start;
  while (index < start + n) {
    const inside = sign(index);
    if (inside === 0) {
      index++;
      continue;
    }
    const first = index;
    let apex = index;
    while (index < start + n && sign(index) === inside) {
      if (Math.abs(curvature[index % n]!) > Math.abs(curvature[apex % n]!)) apex = index;
      index++;
    }
    found.push({
      from: first * step,
      apex: apex * step,
      to: index * step,
      inside,
      radius: 1 / Math.abs(curvature[apex % n]!),
    });
  }
  return found;
}

/** How far before a corner its entry kerb starts and past it its exit kerb runs, in metres. */
const KERB_LEAD_M = { entry: 10, exit: 15 } as const;
/** The shortest apex kerb either side of the apex, in metres. */
const APEX_KERB_MIN_M = 8;

/**
 * The kerbs of a lap: on the outside at each corner's entry and exit, on the inside around its
 * apex. Overlapping kerbs on one side join into one, as a short corner's entry and exit kerbs do.
 */
export function kerbRanges(found: readonly Corner[]): KerbRange[] {
  const ranges: KerbRange[] = [];
  for (const corner of found) {
    const length = corner.to - corner.from;
    const outside = -corner.inside as Side;
    const apexHalf = Math.max(APEX_KERB_MIN_M, length * 0.3);
    ranges.push(
      { from: corner.from - KERB_LEAD_M.entry, to: corner.from + length * 0.3, side: outside },
      {
        from: Math.max(corner.from, corner.apex - apexHalf),
        to: Math.min(corner.to, corner.apex + apexHalf),
        side: corner.inside,
      },
      { from: corner.to - length * 0.3, to: corner.to + KERB_LEAD_M.exit, side: outside },
    );
  }
  const joined: KerbRange[] = [];
  for (const side of [1, -1] as const) {
    const mine = ranges.filter((range) => range.side === side).sort((a, b) => a.from - b.from);
    for (const range of mine) {
      const last = joined.at(-1);
      if (last && last.side === side && range.from <= last.to)
        last.to = Math.max(last.to, range.to);
      else joined.push({ ...range });
    }
  }
  return joined.sort((a, b) => a.from - b.from);
}

/** The distance from `a` to `b` round a closed lap of `length`, either way. */
export function lapGap(a: number, b: number, length: number): number {
  const gap = (((b - a) % length) + length) % length;
  return Math.min(gap, length - gap);
}

/** True when `metres` along a lap of `length` falls inside `range`, wrapping round the lap. */
export function inRange(range: { from: number; to: number }, metres: number, length: number) {
  const at = (((metres - range.from) % length) + length) % length;
  return at <= range.to - range.from;
}

/** How far the run-off widens before a corner's outside and after it, in metres. */
const RUNOFF_RAMP_M = { before: 40, after: 60, ease: 40 } as const;

/**
 * How much of the corner run-off a side of the lap needs at `metres`: 1 on the outside of a
 * corner tighter than 150 m, from a little before it to well past its exit (where a car that runs
 * wide goes), easing to 0 on the straights and on every inside.
 */
export function runoffWeight(
  found: readonly Corner[],
  length: number,
  metres: number,
  side: Side,
): number {
  let weight = 0;
  for (const corner of found) {
    if (corner.inside === side || corner.radius > 150) continue;
    const from = corner.from - RUNOFF_RAMP_M.before;
    const to = corner.to + RUNOFF_RAMP_M.after;
    const middle = (from + to) / 2;
    const half = (to - from) / 2;
    const out = lapGap(middle, metres, length) - half;
    const t = 1 - Math.min(Math.max(out / RUNOFF_RAMP_M.ease, 0), 1);
    weight = Math.max(weight, t * t * (3 - 2 * t));
  }
  return weight;
}

/** A sample of a line in a `TrackIndex`: which line (its index in the list) and how far along. */
type Entry = { line: number; s: number; x: number; z: number };

export type TrackIndex = {
  /**
   * True when a sample of the lines lies within `radius` of `x`, `z`, other than those `skip`
   * rules out (by their line index and distance along it).
   */
  near(x: number, z: number, radius: number, skip?: (line: number, s: number) => boolean): boolean;
};

/** The most a `footprintClear` probe is from the next, in metres. */
const FOOTPRINT_STEP_M = 3;

/**
 * How far from the track's middle a footprint must keep, beyond half its width, in metres: half a
 * metre to spare past the edge, plus what a probe between two of `footprintClear`'s and a place
 * between two samples of the line can miss.
 */
export const FOOTPRINT_CLEARANCE_M = 5;

/**
 * True when no part of a `width` × `depth` rectangle centred on `x`, `z` and turned to `heading`
 * (`width` along it) comes within `radius` of the lines in `index`: probed on a grid over it, so a
 * track cannot slip between the probes of a large one.
 */
export function footprintClear(
  index: TrackIndex,
  footprint: { x: number; z: number; heading: number; width: number; depth: number },
  radius: number,
): boolean {
  const { x, z, heading, width, depth } = footprint;
  const along = Math.max(1, Math.ceil(width / FOOTPRINT_STEP_M));
  const across = Math.max(1, Math.ceil(depth / FOOTPRINT_STEP_M));
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  for (let u = 0; u <= along; u++) {
    for (let w = 0; w <= across; w++) {
      const forward = (u / along - 0.5) * width;
      const left = (w / across - 0.5) * depth;
      // Forward is `(cos h, sin h)`, left of travel `(sin h, −cos h)`, as `sideways` reads it.
      const px = x + cos * forward + sin * left;
      const pz = z + sin * forward - cos * left;
      if (index.near(px, pz, radius)) return false;
    }
  }
  return true;
}

/** A grid of the lines' samples, so a scenery item can ask quickly whether it is off the track. */
export function trackIndex(lines: readonly Centreline[], cell = 25): TrackIndex {
  const grid = new Map<string, Entry[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  for (const [line, centre] of lines.entries()) {
    for (let index = 0; index < centre.x.length; index++) {
      const x = centre.x[index]!;
      const z = centre.z[index]!;
      const cellKey = key(Math.floor(x / cell), Math.floor(z / cell));
      const bucket = grid.get(cellKey) ?? [];
      bucket.push({ line, s: centre.s[index]!, x, z });
      grid.set(cellKey, bucket);
    }
  }
  return {
    near(x, z, radius, skip) {
      const reach = Math.ceil(radius / cell);
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          for (const entry of grid.get(key(cx + dx, cz + dz)) ?? []) {
            if (Math.hypot(entry.x - x, entry.z - z) >= radius) continue;
            if (!skip?.(entry.line, entry.s)) return true;
          }
        }
      }
      return false;
    },
  };
}
