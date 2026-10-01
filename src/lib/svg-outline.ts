/**
 * An SVG outline as a list of points, for code that measures or rebuilds a circuit outside the
 * browser's SVG engine. Reads the absolute `M`, `L`, `C` and `Z` commands the outlines use: the
 * generated circuits are `M x y L x y … Z`, and Aster Park adds cubic curves, which are sampled.
 */

export type OutlinePoint = [number, number];

/** How many straight pieces stand for one cubic curve. */
const CURVE_STEPS = 16;

const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/**
 * The points of an outline, in path order. A closing `Z` does not repeat the first point, and
 * a last point that only repeats the first is dropped, so a closed outline has each point once.
 */
export function outlinePoints(d: string): OutlinePoint[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: OutlinePoint[] = [];
  let command = 'L';
  let index = 0;
  const number = () => Number(tokens[index++]);
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/^[a-zA-Z]$/.test(token)) {
      command = token.toUpperCase();
      index++;
      continue;
    }
    if (command === 'C') {
      const [x0, y0] = points.at(-1) ?? [0, 0];
      const [x1, y1, x2, y2, x3, y3] = [number(), number(), number(), number(), number(), number()];
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const t = step / CURVE_STEPS;
        points.push([cubic(x0, x1, x2, x3, t), cubic(y0, y1, y2, y3, t)]);
      }
    } else {
      // `M`, `L`, and anything else read as a point, so an odd command never stalls the walk.
      points.push([number(), number()]);
    }
  }
  const first = points[0];
  const last = points.at(-1);
  if (first && last && points.length > 2 && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  return points;
}

/** The length of a line through `points`, back to the first one when `closed`. */
export function polylineLength(points: readonly OutlinePoint[], closed: boolean): number {
  let length = 0;
  const segments = closed ? points.length : points.length - 1;
  for (let index = 0; index < segments; index++) {
    const [ax, ay] = points[index]!;
    const [bx, by] = points[(index + 1) % points.length]!;
    length += Math.hypot(bx - ax, by - ay);
  }
  return length;
}
