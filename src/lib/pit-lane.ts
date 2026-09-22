/**
 * Draws an approximate pit lane beside a closed circuit outline.
 *
 * Real pit-lane geometry is not in the outline dataset, so the lane is derived: the stretch
 * of the lap around the start/finish line, from `entry` to `exit`, shifted sideways by
 * `offset` and eased back onto the track at both ends. It is an approximation and is
 * labelled as such wherever it is drawn.
 *
 * Everything is in the outline's own coordinate space, so the function works equally on
 * projected coordinates and on points already fitted to a viewBox.
 */

export type Point = [number, number];

export type PitLaneOptions = {
  /** Lap fraction where the lane leaves the track, before the line: e.g. 0.94. */
  entry: number;
  /** Lap fraction where the lane rejoins the track, after the line: e.g. 0.03. */
  exit: number;
  /** Which side of the track the lane sits on. Pit buildings are inside the loop almost everywhere. */
  side?: 'inside' | 'outside';
  /** Distance between the track centre line and the lane centre line, in point units. */
  offset: number;
  /** Share of the lane's length spent leaving and rejoining the track, at each end. */
  taper?: number;
  /** Sampling step along the lap, as a fraction of it. */
  step?: number;
};

/** Twice the signed area of a closed polygon: positive when it runs anticlockwise in its own axes. */
export function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** A point and the unit direction of travel at a fraction of a closed polyline. */
function polyline(points: readonly Point[]) {
  const count = points.length;
  const lengths = [0];
  for (let i = 0; i < count; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % count]!;
    lengths.push(lengths[i]! + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[count]!;

  return (fraction: number): { point: Point; tangent: Point } => {
    const target = (((fraction % 1) + 1) % 1) * total;
    let i = 0;
    while (i < count - 1 && lengths[i + 1]! < target) i++;
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % count]!;
    const segment = lengths[i + 1]! - lengths[i]!;
    const t = segment === 0 ? 0 : (target - lengths[i]!) / segment;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    return {
      point: [ax + (bx - ax) * t, ay + (by - ay) * t],
      tangent: [(bx - ax) / length, (by - ay) / length],
    };
  };
}

/** Smoothstep: eases the lane away from and back onto the track. */
const ease = (t: number) => t * t * (3 - 2 * t);

/** The `offset` that keeps a lane clear of a track drawn `strokeWidth` wide. */
export const pitLaneOffsetFor = (strokeWidth: number) => Math.round(strokeWidth * 1.6);

export function pitLanePoints(outline: readonly Point[], options: PitLaneOptions): Point[] {
  const { entry, exit, side = 'inside', offset, taper = 0.25, step = 0.002 } = options;
  if (outline.length < 3) return [];

  const at = polyline(outline);
  // The interior is on the left of travel when the polygon runs anticlockwise in its own
  // axes; the left normal of a direction (tx, ty) is (-ty, tx) in those same axes.
  const interiorLeft = signedArea(outline) > 0;
  const sign = (side === 'inside') === interiorLeft ? 1 : -1;

  const span = 1 - entry + exit;
  const count = Math.max(2, Math.ceil(span / step));
  const points: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const { point, tangent } = at(entry + u * span);
    const distance = offset * ease(Math.min(1, Math.min(u, 1 - u) / taper));
    points.push([point[0] - tangent[1] * distance * sign, point[1] + tangent[0] * distance * sign]);
  }
  return points;
}
