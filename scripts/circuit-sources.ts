/**
 * The circuit outlines both `circuits:build` and `circuits:elevation` read: bacinger/f1-circuits
 * (MIT), one GeoJSON LineString per venue, in longitude and latitude.
 */

export const SOURCE = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits';

/** The 2026 calendar, in season order. */
export const CALENDAR_2026 = [
  'au-1953',
  'cn-2004',
  'jp-1962',
  'bh-2002',
  'sa-2021',
  'us-2022',
  'ca-1978',
  'mc-1929',
  'es-1991',
  'at-1969',
  'gb-1948',
  'be-1925',
  'hu-1986',
  'nl-1948',
  'it-1922',
  'es-2026',
  'az-2016',
  'sg-2008',
  'us-2012',
  'mx-1962',
  'br-1940',
  'us-2023',
  'qa-2004',
  'ae-2009',
] as const;

export type CircuitId = (typeof CALENDAR_2026)[number];

/** The source lists these in the wrong direction of travel; the point order is reversed. */
export const REVERSED = new Set<string>(['sg-2008']);

export type Feature = {
  properties: { id: string; Name: string; Location: string; length: number };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
};
type FeatureCollection = { features: Feature[] };

export async function fetchCircuit(id: string): Promise<Feature> {
  const response = await fetch(`${SOURCE}/${id}.geojson`);
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const collection = (await response.json()) as FeatureCollection;
  const feature = collection.features[0];
  if (!feature || feature.geometry.type !== 'LineString') {
    throw new Error(`${id}: expected one LineString feature`);
  }
  return feature;
}

/**
 * The outline's points in the direction of travel, `[lon, lat]`, start/finish first. A closed
 * LineString repeats its first point; it is dropped (`pathFromPoints` closes with `Z` instead).
 */
export function lapCoordinates(
  coordinates: [number, number][],
  reversed: boolean,
): [number, number][] {
  let points = coordinates;
  const [first] = points;
  const last = points.at(-1);
  if (first && last && first[0] === last[0] && first[1] === last[1]) points = points.slice(0, -1);
  if (reversed) {
    // Keep the same start/finish point, reverse the direction of travel.
    const [start, ...rest] = points;
    points = start ? [start, ...rest.reverse()] : points;
  }
  return points;
}

/**
 * The plain equirectangular projection `circuits:build` draws with: longitude scaled by the
 * cosine of the mean latitude, so a metre is a metre on both axes. Returns the scale too.
 */
export function equirectangular(points: [number, number][]): {
  points: [number, number][];
  k: number;
} {
  const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  return { points: points.map(([lon, lat]) => [lon * k, lat]), k };
}
