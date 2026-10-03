/**
 * Generates a circuit's racing line (see `CONTEXT.md`) for `circuits:build`: how far a car is
 * taken to sit to the side of the outline at each point of the lap. Nothing measured goes in, only
 * the outline's shape and the track's width.
 *
 * The line is a minimum-curvature path inside the track: each point may only slide across the
 * track, along the outline's normal, and the line minimises the sum of its squared curvature
 * (its bending) with a light pull towards the middle, so a long straight drifts back
 * to the centre instead of hugging whichever edge the last corner left it at. The bending makes it
 * wide into a corner, tight at its apex and wide out of it. It is solved by accelerated projected
 * gradient descent (FISTA) with a fixed number of steps, so it is deterministic.
 *
 * Offsets are signed metres, positive to the left of the direction of travel as the Track Map
 * draws it (SVG `y` down, so left of a car heading along `+x` is `-y`).
 */

export type Point = readonly [number, number];

/** How far inside each track edge the line stays, in metres. */
export const RACING_LINE_MARGIN_M = 1;
/** The pull towards the middle, per sample and square metre of offset, against the bending. */
export const CENTRE_PULL = 1e-5;
/** Rounds of the solver, each reweighting the points by their spacing on the line so far. */
export const RACING_LINE_ROUNDS = 4;
/** Gradient steps per round: enough to settle every corner of the calendar. */
export const RACING_LINE_ITERATIONS = 1500;
/** The most a point's spacing may weigh it either way, so a fold cannot run away. */
const MAX_WEIGHT = 8;

/**
 * The left normal at each point of a closed loop, `(sin h, −cos h)` for the heading `h` taken
 * from the points either side.
 */
export function leftNormals(points: readonly Point[]): { nx: Float64Array; ny: Float64Array } {
  const n = points.length;
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let index = 0; index < n; index++) {
    const [ax, ay] = points[(index - 1 + n) % n]!;
    const [bx, by] = points[(index + 1) % n]!;
    const heading = Math.atan2(by - ay, bx - ax);
    nx[index] = Math.sin(heading);
    ny[index] = -Math.cos(heading);
  }
  return { nx, ny };
}

/**
 * The racing line's offset from each point of a closed loop of evenly spaced `points` in metres,
 * inside `±limitM` (half the track width less the margin).
 *
 * The bending at a point is its second difference across the line, `(p[i-1] − 2p[i] + p[i+1])·m`
 * with `m` the line's normal there: along the line, a second difference only says the points are
 * unevenly spaced. It reads curvature times the spacing squared, and the points bunch up on the
 * inside of a corner, so each point also weighs `(h / ds)³` for its spacing `ds` (`h` the
 * outline's), and the sum stands for the curvature squared along the line, `Σ κ² ds`. The normals
 * and spacings come from the line of the round before, the first round from the outline's.
 */
export function racingLineOffsets(points: readonly Point[], limitM: number): Float64Array {
  const n = points.length;
  const limit = Math.max(0, limitM);
  const { nx, ny } = leftNormals(points);
  const cx = Float64Array.from(points, ([x]) => x);
  const cy = Float64Array.from(points, ([, y]) => y);
  let nominal = 0;
  for (let index = 0; index < n; index++) {
    const after = (index + 1) % n;
    nominal += Math.hypot(cx[after]! - cx[index]!, cy[after]! - cy[index]!) / n;
  }

  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const ex = new Float64Array(n);
  const ey = new Float64Array(n);
  const weight = new Float64Array(n).fill(1);
  const mx = Float64Array.from(nx);
  const my = Float64Array.from(ny);
  let offsets = new Float64Array(n);
  let previous = new Float64Array(n);
  const look = new Float64Array(n);
  const clamp = (value: number) => Math.min(limit, Math.max(-limit, value));
  const place = (from: Float64Array) => {
    for (let index = 0; index < n; index++) {
      px[index] = cx[index]! + from[index]! * nx[index]!;
      py[index] = cy[index]! + from[index]! * ny[index]!;
    }
  };

  for (let round = 0; round < RACING_LINE_ROUNDS; round++) {
    if (round > 0) {
      place(offsets);
      for (let index = 0; index < n; index++) {
        const before = (index - 1 + n) % n;
        const after = (index + 1) % n;
        const spacing =
          (Math.hypot(px[after]! - px[index]!, py[after]! - py[index]!) +
            Math.hypot(px[index]! - px[before]!, py[index]! - py[before]!)) /
          2;
        const ratio = nominal / Math.max(spacing, 1e-9);
        weight[index] = Math.min(MAX_WEIGHT, Math.max(1 / MAX_WEIGHT, ratio ** 3));
        const heading = Math.atan2(py[after]! - py[before]!, px[after]! - px[before]!);
        mx[index] = Math.sin(heading);
        my[index] = -Math.cos(heading);
      }
    }
    let heaviest = 0;
    for (let index = 0; index < n; index++) heaviest = Math.max(heaviest, weight[index]!);
    // f(o) = Σ w·((p[i-1] − 2p[i] + p[i+1])·m)² + CENTRE_PULL·Σ o[i]², with p = c + o·n. The
    // second difference's largest eigenvalue is 4, so the gradient is 2·(16·max w + pull)-Lipschitz.
    const step = 1 / (2 * (16 * heaviest + CENTRE_PULL));
    look.set(offsets);
    let momentum = 1;
    for (let iteration = 0; iteration < RACING_LINE_ITERATIONS; iteration++) {
      place(look);
      for (let index = 0; index < n; index++) {
        const before = (index - 1 + n) % n;
        const after = (index + 1) % n;
        const across =
          (px[before]! - 2 * px[index]! + px[after]!) * mx[index]! +
          (py[before]! - 2 * py[index]! + py[after]!) * my[index]!;
        ex[index] = weight[index]! * across * mx[index]!;
        ey[index] = weight[index]! * across * my[index]!;
      }
      const next = previous;
      for (let index = 0; index < n; index++) {
        const before = (index - 1 + n) % n;
        const after = (index + 1) % n;
        const gx = ex[before]! - 2 * ex[index]! + ex[after]!;
        const gy = ey[before]! - 2 * ey[index]! + ey[after]!;
        const gradient = 2 * (gx * nx[index]! + gy * ny[index]!) + 2 * CENTRE_PULL * look[index]!;
        next[index] = clamp(look[index]! - step * gradient);
      }
      const nextMomentum = (1 + Math.sqrt(1 + 4 * momentum * momentum)) / 2;
      const blend = (momentum - 1) / nextMomentum;
      for (let index = 0; index < n; index++) {
        look[index] = clamp(next[index]! + blend * (next[index]! - offsets[index]!));
      }
      previous = offsets;
      offsets = next;
      momentum = nextMomentum;
    }
  }
  return offsets;
}

/** The racing line's points: each outline point moved `offsets` metres to its left. */
export function offsetPoints(points: readonly Point[], offsets: ArrayLike<number>): Point[] {
  const { nx, ny } = leftNormals(points);
  return points.map(([x, y], index) => [
    x + offsets[index]! * nx[index]!,
    y + offsets[index]! * ny[index]!,
  ]);
}
