import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { trackWidthFor } from '../src/data/track-widths.ts';
import { lapModelFromOutline } from '../src/lib/outline-speed-profile.ts';
import {
  type PitLaneOptions,
  pitLaneConflicts,
  pitLaneOffsetFor,
  pitLanePoints,
} from '../src/lib/pit-lane.ts';
import { polylineLength } from '../src/lib/svg-outline.ts';
import {
  CALENDAR_2026,
  type CircuitId,
  REVERSED,
  equirectangular,
  fetchCircuit,
  lapCoordinates,
} from './circuit-sources.ts';
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
 * around the line, shifted to the inside of the loop (the outside where the inside would
 * come too close to another part of the lap) and eased back onto the track
 * (see `src/lib/pit-lane.ts`). `PIT_LANES` overrides the defaults per venue.
 *
 * Each circuit also carries its racing line, a minimum-curvature path inside the track's width
 * (see `src/lib/racing-line.ts`), and its speed profile (ADR 0005), modelled from the racing
 * line's curvature with grip, braking, acceleration and top-speed limits
 * (see `src/lib/outline-speed-profile.ts`).
 */
/** Where the pit lane leaves and rejoins the lap, as fractions of it, unless overridden. */
const PIT_LANE_DEFAULTS = { entry: 0.94, exit: 0.03 } as const;

/**
 * Per-venue pit lane adjustments, only where the automatic side (see `pitLane`) cannot decide:
 * `side`, `entry` or `exit`. None is needed yet.
 */
const PIT_LANES: Partial<Record<CircuitId, Partial<PitLaneOptions>>> = {};

/**
 * How far a pit lane's centre line keeps from any other part of the lap, in metres beyond half
 * the track: the Onboard view's pit wall on one side, its working lane and garages (15.1 m) on the
 * other, and a little to spare.
 */
const PIT_LANE_CLEARANCE_M = 16;

const WIDTH = 1000;
const MIN_HEIGHT = 450;
const MAX_HEIGHT = 800;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, '..', 'src', 'data', 'circuits.ts');

function project(coordinates: [number, number][], reversed: boolean): [number, number][] {
  return equirectangular(lapCoordinates(coordinates, reversed)).points;
}

function fit(points: [number, number][]) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round((WIDTH * spanY) / spanX)));
  return fitPoints(points, { width: WIDTH, height, padding: 40 });
}

/**
 * The venue's pit lane. Its side is the inside of the loop, as almost everywhere, unless the lane
 * and its garages would come too close to another part of the lap there, where the lap folds back
 * near the pits; then the outside. A `side` in `PIT_LANES` wins.
 */
function pitLane(outline: [number, number][], id: CircuitId, lengthM: number) {
  const options = {
    ...PIT_LANE_DEFAULTS,
    offset: pitLaneOffsetFor(TRACK_MAP_STROKE_WIDTH),
    ...PIT_LANES[id],
  };
  const clearance = {
    metres: lengthM / polylineLength(outline, true),
    clearance: trackWidthFor(id) / 2 + PIT_LANE_CLEARANCE_M,
  };
  const side =
    options.side ??
    (['inside', 'outside'] as const).find(
      (candidate) =>
        pitLaneConflicts(outline, { ...options, side: candidate }, clearance).length === 0,
    );
  if (side === undefined) {
    throw new Error(`${id}: the pit lane crosses the lap on either side; set it in PIT_LANES`);
  }
  const points = pitLanePoints(outline, { ...options, side });
  return { d: pointsToPath(points, false), entry: options.entry, exit: options.exit };
}

async function main() {
  const circuits = [];
  for (const id of CALENDAR_2026) {
    const feature = await fetchCircuit(id);
    const fitted = fit(project(feature.geometry.coordinates, REVERSED.has(id)));
    const d = pointsToPath(fitted.points);
    // From the rounded `d` the Track Map draws, so the shares are of the very same path.
    const { profile, racingLine } = lapModelFromOutline(
      d,
      feature.properties.length,
      trackWidthFor(id),
    );
    circuits.push({
      id,
      name: feature.properties.Name,
      location: feature.properties.Location,
      lengthM: feature.properties.length,
      d,
      viewBox: fitted.viewBox,
      pit: pitLane(fitted.points, id, feature.properties.length),
      profile,
      racingLine,
    });
    process.stdout.write(`${id} ${feature.properties.Name} (${fitted.viewBox})\n`);
  }

  const body = circuits
    .map(
      (c) =>
        `  {\n    id: ${JSON.stringify(c.id)},\n    name: ${JSON.stringify(c.name)},\n    location: ${JSON.stringify(c.location)},\n    lengthM: ${c.lengthM},\n    viewBox: ${JSON.stringify(c.viewBox)},\n    d: ${JSON.stringify(c.d)},\n    pit: { entry: ${c.pit.entry}, exit: ${c.pit.exit}, d: ${JSON.stringify(c.pit.d)} },\n    profile: {\n      time: ${JSON.stringify(c.profile.time)},\n      start: ${JSON.stringify(c.profile.start)},\n    },\n    racingLine: ${JSON.stringify(c.racingLine)},\n  }`,
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
   * How a lap's time is shared out along it (ADR 0005), modelled along the racing line: a flying
   * lap in \`time\`, lap 1 from a standing start in \`start\`. An approximation, never telemetry.
   */
  profile: Required<SpeedProfile>;
  /**
   * The racing line, generated inside the track's width: metres to the left of travel (as the
   * Track Map draws it), evenly spaced round the lap, entry \`j\` at the share \`j / length\` of
   * the outline's distance. It only moves a car sideways.
   */
  racingLine: readonly number[];
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
