/**
 * Builds the Onboard view's static scenery into a few merged geometries, so a whole circuit of
 * kerbs, walls or run-off is one draw call each: strips along a line, walls standing on one and
 * boxes, coloured per vertex.
 */
import { BufferAttribute, BufferGeometry, type Color } from 'three';
import { type TrackPoint, sideways } from './track';

type Vec3 = [number, number, number];

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colours: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  get empty() {
    return this.indices.length === 0;
  }

  /**
   * A flat-shaded quad `a b c d` round its edge, facing `normal`. The winding is taken from the
   * normal, so every face is front-facing from the side it lights.
   */
  quad(corners: [Vec3, Vec3, Vec3, Vec3], normal: Vec3, colour: Color, uv?: [number, number][]) {
    const base = this.positions.length / 3;
    for (const [index, corner] of corners.entries()) {
      this.positions.push(...corner);
      this.normals.push(...normal);
      this.colours.push(colour.r, colour.g, colour.b);
      this.uvs.push(...(uv?.[index] ?? [0, 0]));
    }
    const [a, b, c] = corners;
    const cross: Vec3 = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const facing = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2];
    if (facing >= 0) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  /**
   * A strip between `inner` and `outer` metres to the left of travel (negative is right) along
   * `points`, a quad per segment so a colour per segment stays crisp. `y` lifts the inner and
   * outer edges; the texture coordinates are in metres over `tile`, across and along.
   */
  strip(
    points: readonly TrackPoint[],
    options: {
      inner: (index: number) => number;
      outer: (index: number) => number;
      colour: (segment: number) => Color | undefined;
      closed?: boolean;
      y?: [number, number];
      tile?: number;
    },
  ) {
    const { inner, outer, colour, closed = false, y = [0, 0], tile = 8 } = options;
    const n = points.length;
    const along = distances(points, closed);
    for (let segment = 0; segment < (closed ? n : n - 1); segment++) {
      const shade = colour(segment);
      if (!shade) continue;
      const a = points[segment]!;
      const b = points[(segment + 1) % n]!;
      const corner = (point: TrackPoint, left: number, height: number): Vec3 => {
        const [x, z] = sideways(point.x, point.z, point.heading, left);
        return [x, height, z];
      };
      const bi = (segment + 1) % n;
      const sa = along[segment]!;
      const sb = along[segment + 1]!;
      this.quad(
        [
          corner(a, inner(segment), y[0]),
          corner(a, outer(segment), y[1]),
          corner(b, outer(bi), y[1]),
          corner(b, inner(bi), y[0]),
        ],
        [0, 1, 0],
        shade,
        [
          [inner(segment) / tile, sa / tile],
          [outer(segment) / tile, sa / tile],
          [outer(bi) / tile, sb / tile],
          [inner(bi) / tile, sb / tile],
        ],
      );
    }
  }

  /**
   * A wall standing `offset` metres to the left of travel along `points`, from `base` up to
   * `height`, `thickness` thick: both faces and its top, on every segment `keep` allows.
   */
  wall(
    points: readonly TrackPoint[],
    options: {
      offset: (index: number) => number;
      height: number;
      thickness: number;
      colour: Color;
      keep?: (segment: number) => boolean;
      closed?: boolean;
      base?: number;
    },
  ) {
    const { offset, height, thickness, colour, keep, closed = false, base = 0 } = options;
    const n = points.length;
    for (let segment = 0; segment < (closed ? n : n - 1); segment++) {
      if (keep && !keep(segment)) continue;
      const bi = (segment + 1) % n;
      const a = points[segment]!;
      const b = points[bi]!;
      const at = (point: TrackPoint, left: number, height: number): Vec3 => {
        const [x, z] = sideways(point.x, point.z, point.heading, left);
        return [x, height, z];
      };
      const half = thickness / 2;
      const [ox, oz] = sideways(0, 0, (a.heading + b.heading) / 2, 1);
      const sides = [
        { left: offset(segment) + half, leftB: offset(bi) + half, normal: [ox, 0, oz] as Vec3 },
        { left: offset(segment) - half, leftB: offset(bi) - half, normal: [-ox, 0, -oz] as Vec3 },
      ];
      for (const side of sides) {
        this.quad(
          [
            at(a, side.left, base),
            at(b, side.leftB, base),
            at(b, side.leftB, height),
            at(a, side.left, height),
          ],
          side.normal,
          colour,
        );
      }
      this.quad(
        [
          at(a, offset(segment) - half, height),
          at(b, offset(bi) - half, height),
          at(b, offset(bi) + half, height),
          at(a, offset(segment) + half, height),
        ],
        [0, 1, 0],
        colour,
      );
    }
  }

  /**
   * A box `size` (along, up, across) standing on `y`, its middle at `x`, `z` and its length
   * along `heading`; no bottom face.
   */
  box(x: number, y: number, z: number, heading: number, size: Vec3, colour: Color) {
    const [length, height, width] = size;
    const dx = Math.cos(heading);
    const dz = Math.sin(heading);
    const [lx, lz] = sideways(0, 0, heading, 1);
    const at = (along: number, up: number, left: number): Vec3 => [
      x + dx * along * length + lx * left * width,
      y + up * height,
      z + dz * along * length + lz * left * width,
    ];
    const h = 0.5;
    this.quad([at(-h, 1, -h), at(h, 1, -h), at(h, 1, h), at(-h, 1, h)], [0, 1, 0], colour);
    this.quad([at(h, 0, -h), at(h, 0, h), at(h, 1, h), at(h, 1, -h)], [dx, 0, dz], colour);
    this.quad([at(-h, 0, -h), at(-h, 1, -h), at(-h, 1, h), at(-h, 0, h)], [-dx, 0, -dz], colour);
    this.quad([at(-h, 0, h), at(-h, 1, h), at(h, 1, h), at(h, 0, h)], [lx, 0, lz], colour);
    this.quad([at(-h, 0, -h), at(h, 0, -h), at(h, 1, -h), at(-h, 1, -h)], [-lx, 0, -lz], colour);
  }

  /**
   * A thin vertical sheet `offset` metres to the left of travel along `points`, from `base` to
   * `top`, facing both ways, its texture coordinates in metres over `tile` (for a wire fence).
   */
  curtain(
    points: readonly TrackPoint[],
    options: {
      offset: (index: number) => number;
      base: number;
      top: number;
      colour: Color;
      keep?: (segment: number) => boolean;
      closed?: boolean;
      tile?: number;
    },
  ) {
    const { offset, base, top, colour, keep, closed = false, tile = 1 } = options;
    const n = points.length;
    const along = distances(points, closed);
    for (let segment = 0; segment < (closed ? n : n - 1); segment++) {
      if (keep && !keep(segment)) continue;
      const bi = (segment + 1) % n;
      const a = points[segment]!;
      const b = points[bi]!;
      const [ax, az] = sideways(a.x, a.z, a.heading, offset(segment));
      const [bx, bz] = sideways(b.x, b.z, b.heading, offset(bi));
      const [ox, oz] = sideways(0, 0, (a.heading + b.heading) / 2, 1);
      const u0 = along[segment]! / tile;
      const u1 = along[segment + 1]! / tile;
      const corners: [Vec3, Vec3, Vec3, Vec3] = [
        [ax, base, az],
        [bx, base, bz],
        [bx, top, bz],
        [ax, top, az],
      ];
      const uv: [number, number][] = [
        [u0, base / tile],
        [u1, base / tile],
        [u1, top / tile],
        [u0, top / tile],
      ];
      this.quad(corners, [ox, 0, oz], colour, uv);
      this.quad(corners, [-ox, 0, -oz], colour, uv);
    }
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colours), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setIndex(new BufferAttribute(new Uint32Array(this.indices), 1));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Distance along `points` at each one, plus the closing length for a closed line. */
function distances(points: readonly TrackPoint[], closed: boolean): Float64Array {
  const n = points.length;
  const out = new Float64Array(n + 1);
  for (let index = 1; index <= n; index++) {
    const a = points[index - 1]!;
    const b = points[index % n]!;
    out[index] = out[index - 1]! + (index < n || closed ? Math.hypot(b.x - a.x, b.z - a.z) : 0);
  }
  return out;
}

/** Points every `step` metres along a line from `from` to `to`, in the line's own metres. */
export function samplesAlong(
  pointAt: (metres: number) => TrackPoint,
  from: number,
  to: number,
  step: number,
): TrackPoint[] {
  const count = Math.max(1, Math.round((to - from) / step));
  return Array.from({ length: count + 1 }, (_, index) =>
    pointAt(from + ((to - from) * index) / count),
  );
}
