/**
 * A circuit's elevation round the lap, for `circuits:elevation` and the Onboard view: how the raw
 * heights sampled from a surface model are smoothed into a lap a car can drive, and how a height
 * is read back at a share of the lap.
 *
 * The sources are surface models (Copernicus GLO-30) or radar heights (SRTM): trees, stands and
 * bridges stand on the ground in them. So the raw heights go through a median, which drops
 * the odd spike, then a wide moving average, and last a limit on the gradient. Everything runs
 * round the closed lap, so its start and end meet at the same height.
 */

/** Distance between the stored heights, in metres. */
export const ELEVATION_STEP_M = 20;
/** The median's window, in metres: it drops a spike shorter than about half of it. */
export const MEDIAN_WINDOW_M = 90;
/** How far either side the moving average reaches, in metres; it runs twice. */
export const AVERAGE_REACH_M = 75;
/** The steepest gradient left after smoothing: 12 %. */
export const MAX_GRADE = 0.12;
/** Decimals the stored heights are rounded to (10 cm). */
export const ELEVATION_DECIMALS = 1;

/** The value `index` of a closed array, wrapping either way. */
const round = (values: ArrayLike<number>, index: number) => {
  const n = values.length;
  return values[((index % n) + n) % n]!;
};

/** A running median round a closed array, `reach` samples either side. */
export function medianRound(values: readonly number[], reach: number): number[] {
  if (reach <= 0 || values.length === 0) return values.slice();
  const window: number[] = [];
  return values.map((_, index) => {
    window.length = 0;
    for (let offset = -reach; offset <= reach; offset++) window.push(round(values, index + offset));
    window.sort((a, b) => a - b);
    return window[reach]!;
  });
}

/** A moving average round a closed array, `reach` samples either side. */
export function averageRound(values: readonly number[], reach: number): number[] {
  if (reach <= 0 || values.length === 0) return values.slice();
  return values.map((_, index) => {
    let sum = 0;
    for (let offset = -reach; offset <= reach; offset++) sum += round(values, index + offset);
    return sum / (2 * reach + 1);
  });
}

/**
 * Round a closed array of heights `stepM` apart, no gradient steeper than `grade`: halfway between
 * the highest heights under the values and the lowest above them that keep to it. Heights that
 * already keep to it are left as they are, and the lap stays closed.
 */
export function limitGrade(values: readonly number[], stepM: number, grade: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const rise = grade * stepM;
  const upper = values.slice();
  const lower = values.slice();
  // Twice round in each direction, so a limit carries past where the lap wraps.
  for (let pass = 0; pass < 2 * n; pass++) {
    const here = pass % n;
    const before = (here - 1 + n) % n;
    upper[here] = Math.min(upper[here]!, upper[before]! + rise);
    lower[here] = Math.max(lower[here]!, lower[before]! - rise);
  }
  for (let pass = 2 * n - 1; pass >= 0; pass--) {
    const here = pass % n;
    const after = (here + 1) % n;
    upper[here] = Math.min(upper[here]!, upper[after]! + rise);
    lower[here] = Math.max(lower[here]!, lower[after]! - rise);
  }
  return upper.map((value, index) => (value + lower[index]!) / 2);
}

/**
 * Raw heights round a closed lap, `stepM` apart, smoothed into heights a car can drive: the
 * median, the moving average twice, the gradient limit, then measured from the lap's lowest
 * point and rounded to `ELEVATION_DECIMALS`.
 */
export function smoothLapElevation(raw: readonly number[], stepM: number): number[] {
  if (raw.length === 0) return [];
  const samples = (metres: number) => Math.max(0, Math.round(metres / stepM));
  const medianReach = samples(MEDIAN_WINDOW_M / 2);
  const averageReach = samples(AVERAGE_REACH_M);
  const median = medianRound(raw, medianReach);
  const averaged = averageRound(averageRound(median, averageReach), averageReach);
  const limited = limitGrade(averaged, stepM, MAX_GRADE);
  const lowest = Math.min(...limited);
  const scale = 10 ** ELEVATION_DECIMALS;
  return limited.map((value) => Math.round((value - lowest) * scale) / scale);
}

/**
 * The height `share` of the way round a closed lap of evenly spaced heights (entry `j` at the
 * share `j / length`), linear between them; 0 when there are none.
 */
export function elevationAt(heights: readonly number[], share: number): number {
  const n = heights.length;
  if (n === 0) return 0;
  const at = (((share * n) % n) + n) % n;
  const index = Math.floor(at);
  const a = heights[index % n]!;
  const b = heights[(index + 1) % n]!;
  return a + (b - a) * (at - index);
}
