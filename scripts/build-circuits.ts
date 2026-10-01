import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { speedProfileFromOutline } from '../src/lib/outline-speed-profile.ts';
import { type PitLaneOptions, pitLaneOffsetFor, pitLanePoints } from '../src/lib/pit-lane.ts';
import {
  TRACK_MAP_STROKE_WIDTH,
  fitPoints,
  pointsToPath,
} from '../registry/boxbox/ui/track-map.tsx';

/**
 * Generates `src/data/circuits.ts` from bacinger/f1-circuits (MIT), one GeoJSON
 * LineString per venue. Run with `bun run circuits:build`.
 *
 * The outlines are projected with a plain equirectangular projection (longitude
 * scaled by the cosine of the mean latitude, so a metre is a metre on both axes),
 * then fitted into a 1000-wide viewBox whose height follows the circuit's own
 * aspect ratio. The first point of each LineString is taken as start/finish.
 *
 * The source has no pit lanes, so each one is approximated: the stretch of the lap
 * around the line, shifted to the inside of the loop and eased back onto the track
 * (see `src/lib/pit-lane.ts`). `PIT_LANES` overrides the defaults per venue.
 *
 * Each circuit also carries its speed profile (ADR 0005), modelled from the drawn outline's
 * curvature with grip, braking, acceleration and top-speed limits
 * (see `src/lib/outline-speed-profile.ts`).
 */
const SOURCE = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits';

/** Where the pit lane leaves and rejoins the lap, as fractions of it, unless overridden. */
const PIT_LANE_DEFAULTS = { entry: 0.94, exit: 0.03 } as const;

/** Per-venue pit lane adjustments: `side` for the odd circuit with the pits outside the loop. */
const PIT_LANES: Partial<Record<(typeof CALENDAR_2026)[number], Partial<PitLaneOptions>>> = {};

/** The 2026 calendar, in season order. */
const CALENDAR_2026 = [
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

/** The source lists these in the wrong direction of travel; the point order is reversed. */
const REVERSED = new Set<string>(['sg-2008']);

const WIDTH = 1000;
const MIN_HEIGHT = 450;
const MAX_HEIGHT = 800;

type Feature = {
  properties: { id: string; Name: string; Location: string; length: number };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
};
type FeatureCollection = { features: Feature[] };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, '..', 'src', 'data', 'circuits.ts');

async function fetchCircuit(id: string): Promise<Feature> {
  const response = await fetch(`${SOURCE}/${id}.geojson`);
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const collection = (await response.json()) as FeatureCollection;
  const feature = collection.features[0];
  if (!feature || feature.geometry.type !== 'LineString') {
    throw new Error(`${id}: expected one LineString feature`);
  }
  return feature;
}

function project(coordinates: [number, number][], reversed: boolean): [number, number][] {
  let points = coordinates;
  const [first] = points;
  const last = points.at(-1);
  // A closed LineString repeats its first point; `pathFromPoints` closes with `Z` instead.
  if (first && last && first[0] === last[0] && first[1] === last[1]) points = points.slice(0, -1);
  if (reversed) {
    // Keep the same start/finish point, reverse the direction of travel.
    const [start, ...rest] = points;
    points = start ? [start, ...rest.reverse()] : points;
  }
  const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  return points.map(([lon, lat]) => [lon * k, lat]);
}

function fit(points: [number, number][]) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round((WIDTH * spanY) / spanX)));
  return fitPoints(points, { width: WIDTH, height, padding: 40 });
}

function pitLane(outline: [number, number][], id: (typeof CALENDAR_2026)[number]) {
  const options = { ...PIT_LANE_DEFAULTS, ...PIT_LANES[id] };
  const points = pitLanePoints(outline, {
    ...options,
    offset: pitLaneOffsetFor(TRACK_MAP_STROKE_WIDTH),
  });
  return { d: pointsToPath(points, false), entry: options.entry, exit: options.exit };
}

async function main() {
  const circuits = [];
  for (const id of CALENDAR_2026) {
    const feature = await fetchCircuit(id);
    const fitted = fit(project(feature.geometry.coordinates, REVERSED.has(id)));
    const d = pointsToPath(fitted.points);
    circuits.push({
      id,
      name: feature.properties.Name,
      location: feature.properties.Location,
      lengthM: feature.properties.length,
      d,
      viewBox: fitted.viewBox,
      pit: pitLane(fitted.points, id),
      // From the rounded `d` the Track Map draws, so the shares are of the very same path.
      profile: speedProfileFromOutline(d, feature.properties.length),
    });
    process.stdout.write(`${id} ${feature.properties.Name} (${fitted.viewBox})\n`);
  }

  const body = circuits
    .map(
      (c) =>
        `  {\n    id: ${JSON.stringify(c.id)},\n    name: ${JSON.stringify(c.name)},\n    location: ${JSON.stringify(c.location)},\n    lengthM: ${c.lengthM},\n    viewBox: ${JSON.stringify(c.viewBox)},\n    d: ${JSON.stringify(c.d)},\n    pit: { entry: ${c.pit.entry}, exit: ${c.pit.exit}, d: ${JSON.stringify(c.pit.d)} },\n    profile: {\n      time: ${JSON.stringify(c.profile.time)},\n      start: ${JSON.stringify(c.profile.start)},\n    },\n  }`,
    )
    .join(',\n');

  const source = `// Generated by \`bun run circuits:build\` from bacinger/f1-circuits (MIT). Do not edit.
//
// Circuit layouts are the intellectual property of their venues. This project is
// unofficial and not affiliated with any racing series, circuit, or team.

import type { SpeedProfile } from './speed-profile';

export type Circuit = {
  id: string;
  name: string;
  location: string;
  /** Official lap length in metres, from the source data. */
  lengthM: number;
  viewBox: string;
  /** SVG \`d\` in \`viewBox\` units. Start/finish is the first point; travel follows path order. */
  d: string;
  /**
   * An approximate pit lane, derived from the outline (the source has none): an open \`d\`
   * from pit entry to pit exit, with the lap fractions where it leaves and rejoins the track.
   */
  pit: { entry: number; exit: number; d: string };
  /**
   * How a lap's time is shared out along it (ADR 0005), modelled from the outline: a flying lap
   * in \`time\`, lap 1 from a standing start in \`start\`. An approximation, never telemetry.
   */
  profile: Required<SpeedProfile>;
};

export const CIRCUITS: readonly Circuit[] = [
${body},
];

export const circuitById = (id: string) => CIRCUITS.find((circuit) => circuit.id === id);
`;

  await writeFile(outFile, source);
  process.stdout.write(
    `wrote ${path.relative(process.cwd(), outFile)} (${circuits.length} circuits)\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
