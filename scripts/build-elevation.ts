import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { fromUrl } from 'geotiff';

import type { CircuitElevation } from '../src/data/circuit-elevation.ts';
import type { ElevationSource } from '../src/data/elevation-sources.ts';
import { ELEVATION_STEP_M, smoothLapElevation } from '../src/lib/elevation.ts';
import {
  CALENDAR_2026,
  REVERSED,
  equirectangular,
  fetchCircuit,
  lapCoordinates,
} from './circuit-sources.ts';

/**
 * Generates `src/data/circuit-elevation.ts`: each circuit's height round the lap, for the Onboard
 * view. Run with `bun run circuits:elevation`; it reads the same bacinger/f1-circuits outlines as
 * `circuits:build`, so the heights line up with `circuits.ts`.
 *
 * Every `ELEVATION_STEP_M` along the outline it samples the DEM bilinearly at the centreline and
 * `ACROSS_M` either side, and keeps the lowest of the three, which is less often a tree. The
 * heights are then smoothed round the closed lap (`src/lib/elevation.ts`) and stored from the
 * lap's lowest point.
 *
 * Sources:
 * - Copernicus GLO-30 (Cloud Optimized GeoTIFFs on AWS Open Data), read with HTTP range
 *   requests: only the window round each circuit is downloaded.
 * - For Baku, which GLO-30 leaves out (Azerbaijan): the NASA SRTM tile of the AWS Terrain Tiles
 *   ("skadi", 1° HGT, gzipped), downloaded whole.
 *
 * Everything downloaded is cached in `.cache/elevation/` (git-ignored, never committed), so a
 * re-run reads the cache and makes no DEM request.
 */
const GLO30 = 'https://copernicus-dem-30m.s3.amazonaws.com';
const SKADI = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';

/** The circuits GLO-30 leaves out (Armenia and Azerbaijan), sampled from SRTM instead. */
const SRTM_ONLY = new Set<string>(['az-2016']);

/** How far either side of the centreline the DEM is also sampled, in metres. */
const ACROSS_M = 8;
/** Metres in a degree of latitude, near enough for an 8 m offset. */
const METRES_PER_DEGREE = 111_320;
/** Pixels of margin round each window, so the bilinear sample never runs off it. */
const WINDOW_MARGIN_PX = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cacheDir = path.resolve(root, '.cache', 'elevation');
const outFile = path.resolve(root, 'src', 'data', 'circuit-elevation.ts');

/**
 * A grid of heights: pixel (`column`, `row`) has its centre at
 * `west + (column + 0.5) * resLon`, `north - (row + 0.5) * resLat`. NaN is no data.
 */
type Raster = {
  west: number;
  north: number;
  resLon: number;
  resLat: number;
  width: number;
  height: number;
  data: Float32Array;
};

/** The bilinear height at `lon`, `lat`: the mean of what is there where some pixels have none. */
function bilinear(raster: Raster, lon: number, lat: number): number {
  const fx = (lon - raster.west) / raster.resLon - 0.5;
  const fy = (raster.north - lat) / raster.resLat - 0.5;
  if (fx < -0.5 || fy < -0.5 || fx > raster.width - 0.5 || fy > raster.height - 0.5) return NaN;
  const c0 = Math.min(Math.max(Math.floor(fx), 0), raster.width - 2);
  const r0 = Math.min(Math.max(Math.floor(fy), 0), raster.height - 2);
  const tx = Math.min(Math.max(fx - c0, 0), 1);
  const ty = Math.min(Math.max(fy - r0, 0), 1);
  let sum = 0;
  let weights = 0;
  for (const [dc, dr, weight] of [
    [0, 0, (1 - tx) * (1 - ty)],
    [1, 0, tx * (1 - ty)],
    [0, 1, (1 - tx) * ty],
    [1, 1, tx * ty],
  ] as const) {
    const value = raster.data[(r0 + dr) * raster.width + c0 + dc]!;
    if (Number.isNaN(value)) continue;
    sum += value * weight;
    weights += weight;
  }
  return weights > 0 ? sum / weights : NaN;
}

const pad = (value: number, digits: number) => String(Math.abs(value)).padStart(digits, '0');

/** The GLO-30 tile with `lat`, `lon` in it, named by its south-west corner. */
function glo30Tile(lat: number, lon: number): string {
  const south = Math.floor(lat);
  const west = Math.floor(lon);
  return `Copernicus_DSM_COG_10_${south < 0 ? 'S' : 'N'}${pad(south, 2)}_00_${west < 0 ? 'W' : 'E'}${pad(west, 3)}_00_DEM`;
}

async function readCache(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch {
    return undefined;
  }
}

/**
 * The window of GLO-30 tile `tile` round `points` (`[lon, lat]`), from the cache or with HTTP
 * range requests.
 */
async function glo30Window(tile: string, points: readonly [number, number][]): Promise<Raster> {
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  const bounds = [Math.min(...lons), Math.max(...lats), Math.max(...lons), Math.min(...lats)];
  const key = bounds.map((value) => value.toFixed(5)).join('_');
  const metaFile = path.join(cacheDir, 'glo30', `${tile}_${key}.json`);
  const dataFile = metaFile.replace(/\.json$/, '.f32');
  const cachedMeta = await readCache(metaFile);
  const cachedData = await readCache(dataFile);
  if (cachedMeta && cachedData) {
    const meta = JSON.parse(cachedMeta.toString('utf8')) as Omit<Raster, 'data'>;
    const copy = new Uint8Array(cachedData).buffer;
    return { ...meta, data: new Float32Array(copy) };
  }

  const url = `${GLO30}/${tile}/${tile}.tif`;
  let raster: Raster;
  try {
    const tiff = await fromUrl(url);
    const image = await tiff.getImage();
    const [originLon, originLat] = image.getOrigin() as [number, number];
    const [resX, resY] = image.getResolution() as [number, number];
    const resLon = Math.abs(resX);
    const resLat = Math.abs(resY);
    const [west, north, east, south] = bounds as [number, number, number, number];
    const x0 = Math.max(0, Math.floor((west - originLon) / resLon) - WINDOW_MARGIN_PX);
    const y0 = Math.max(0, Math.floor((originLat - north) / resLat) - WINDOW_MARGIN_PX);
    const x1 = Math.min(
      image.getWidth(),
      Math.ceil((east - originLon) / resLon) + WINDOW_MARGIN_PX,
    );
    const y1 = Math.min(
      image.getHeight(),
      Math.ceil((originLat - south) / resLat) + WINDOW_MARGIN_PX,
    );
    const [band] = await image.readRasters({ window: [x0, y0, x1, y1], samples: [0] });
    if (!band || typeof band === 'number') throw new Error('no raster band');
    raster = {
      west: originLon + x0 * resLon,
      north: originLat - y0 * resLat,
      resLon,
      resLat,
      width: x1 - x0,
      height: y1 - y0,
      data: Float32Array.from(band),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GLO-30 tile missing or unreadable: ${url} (${message})`);
  }
  await mkdir(path.dirname(metaFile), { recursive: true });
  const { data, ...meta } = raster;
  await writeFile(metaFile, JSON.stringify(meta));
  await writeFile(dataFile, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return raster;
}

/** The whole SRTM tile with `lat`, `lon` in it (1° HGT, gzipped), from the cache or downloaded. */
async function srtmTile(lat: number, lon: number): Promise<Raster> {
  const south = Math.floor(lat);
  const west = Math.floor(lon);
  const ns = `${south < 0 ? 'S' : 'N'}${pad(south, 2)}`;
  const name = `${ns}${west < 0 ? 'W' : 'E'}${pad(west, 3)}`;
  const url = `${SKADI}/${ns}/${name}.hgt.gz`;
  const file = path.join(cacheDir, 'skadi', `${name}.hgt.gz`);
  let gz = await readCache(file);
  if (!gz) {
    const response = await fetch(url).catch((error: unknown) => {
      throw new Error(`SRTM tile unreachable: ${url} (${String(error)})`);
    });
    if (!response.ok) throw new Error(`SRTM tile missing: ${url} (HTTP ${response.status})`);
    gz = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, gz);
  }
  const hgt = gunzipSync(gz);
  const side = Math.round(Math.sqrt(hgt.length / 2));
  if (side * side * 2 !== hgt.length) throw new Error(`${file}: not a square HGT tile`);
  const data = new Float32Array(side * side);
  for (let index = 0; index < data.length; index++) {
    const value = hgt.readInt16BE(index * 2);
    data[index] = value === -32768 ? NaN : value;
  }
  // HGT samples sit on the whole arc-seconds, edges included: the first one is on the corner.
  const res = 1 / (side - 1);
  return {
    west: west - res / 2,
    north: south + 1 + res / 2,
    resLon: res,
    resLat: res,
    width: side,
    height: side,
    data,
  };
}

/**
 * Evenly spaced places round the lap, `[lon, lat]`: `count` of them, place `j` at the share
 * `j / count` of the outline's distance as `circuits:build` projects it, each with a place
 * `ACROSS_M` either side.
 */
function lapPlaces(coordinates: [number, number][], count: number): [number, number][][] {
  const { points, k } = equirectangular(coordinates);
  const n = points.length;
  const cumulative = [0];
  for (let index = 0; index < n; index++) {
    const [ax, ay] = points[index]!;
    const [bx, by] = points[(index + 1) % n]!;
    cumulative.push(cumulative[index]! + Math.hypot(bx - ax, by - ay));
  }
  const total = cumulative[n]!;
  const across = ACROSS_M / METRES_PER_DEGREE;
  const places: [number, number][][] = [];
  let segment = 0;
  for (let j = 0; j < count; j++) {
    const wanted = (j / count) * total;
    while (segment < n - 1 && cumulative[segment + 1]! < wanted) segment++;
    const [ax, ay] = points[segment]!;
    const [bx, by] = points[(segment + 1) % n]!;
    const length = cumulative[segment + 1]! - cumulative[segment]!;
    const t = length === 0 ? 0 : (wanted - cumulative[segment]!) / length;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const nx = length === 0 ? 0 : -(by - ay) / length;
    const ny = length === 0 ? 0 : (bx - ax) / length;
    places.push([-1, 0, 1].map((side) => [(x + nx * across * side) / k, y + ny * across * side]));
  }
  return places;
}

/** Fills the NaNs of a closed array from the nearest value round it. */
function fillGaps(values: number[], id: string): number[] {
  const n = values.length;
  if (values.every((value) => Number.isNaN(value))) throw new Error(`${id}: no elevation data`);
  return values.map((value, index) => {
    if (!Number.isNaN(value)) return value;
    for (let reach = 1; reach < n; reach++) {
      for (const at of [index - reach, index + reach]) {
        const near = values[((at % n) + n) % n]!;
        if (!Number.isNaN(near)) return near;
      }
    }
    return 0;
  });
}

/** The raw heights of one circuit, one per place, and where they come from. */
async function rawHeights(
  id: string,
  places: [number, number][][],
): Promise<{ source: ElevationSource; raw: number[] }> {
  const all = places.flat();
  const rasters = new Map<string, Raster>();
  let source: ElevationSource;
  let tileOf: (lon: number, lat: number) => string;
  if (SRTM_ONLY.has(id)) {
    source = 'srtm';
    tileOf = (lon, lat) => `${Math.floor(lat)},${Math.floor(lon)}`;
    for (const [lon, lat] of all) {
      const tile = tileOf(lon, lat);
      if (!rasters.has(tile)) rasters.set(tile, await srtmTile(lat, lon));
    }
  } else {
    source = 'copernicus-glo30';
    tileOf = (lon, lat) => glo30Tile(lat, lon);
    const byTile = new Map<string, [number, number][]>();
    for (const place of all) {
      const tile = tileOf(...place);
      byTile.set(tile, [...(byTile.get(tile) ?? []), place]);
    }
    for (const [tile, points] of byTile) rasters.set(tile, await glo30Window(tile, points));
  }
  const raw = places.map((across) => {
    const heights = across
      .map(([lon, lat]) => bilinear(rasters.get(tileOf(lon, lat))!, lon, lat))
      .filter((value) => !Number.isNaN(value));
    return heights.length === 0 ? NaN : Math.min(...heights);
  });
  return { source, raw: fillGaps(raw, id) };
}

async function main() {
  const elevations: [string, CircuitElevation][] = [];
  const rows: string[] = [];
  for (const id of CALENDAR_2026) {
    const feature = await fetchCircuit(id);
    const coordinates = lapCoordinates(feature.geometry.coordinates, REVERSED.has(id));
    const count = Math.max(3, Math.round(feature.properties.length / ELEVATION_STEP_M));
    const { source, raw } = await rawHeights(id, lapPlaces(coordinates, count));
    const heights = smoothLapElevation(raw, feature.properties.length / count);
    elevations.push([id, { source, heights }]);
    const lowest = Math.min(...raw);
    const highest = Math.max(...raw);
    rows.push(
      [
        id.padEnd(8),
        source.padEnd(17),
        `${lowest.toFixed(0)}–${highest.toFixed(0)} m`.padEnd(14),
        `${Math.max(...heights).toFixed(1)} m`.padStart(8),
        `${feature.properties.Name}`,
      ].join(' '),
    );
    process.stdout.write(`${id} ${source} ${heights.length} heights\n`);
  }

  const body = elevations
    .map(
      ([id, { source, heights }]) =>
        `  ${JSON.stringify(id)}: {\n    source: ${JSON.stringify(source)},\n    heights: ${JSON.stringify(heights)},\n  },`,
    )
    .join('\n');
  const source = `// Generated by \`bun run circuits:elevation\`. Do not edit.
//
// Heights produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and
// Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights
// reserved. Baku from NASA SRTM via the AWS Terrain Tiles. See THIRD_PARTY_NOTICES.md.

import type { ElevationSource } from './elevation-sources';

export type CircuitElevation = {
  source: ElevationSource;
  /**
   * Metres above the lap's lowest point, smoothed (\`src/lib/elevation.ts\`), evenly spaced round
   * the closed lap: entry \`j\` at the share \`j / length\` of the outline's distance.
   */
  heights: readonly number[];
};

/** Each circuit's elevation, by its id in \`circuits.ts\`. A circuit without one is flat. */
export const CIRCUIT_ELEVATION: Readonly<Partial<Record<string, CircuitElevation>>> = {
${body}
};
`;
  await writeFile(outFile, source);
  // The same layout `bun run format` gives it, so `format:check` passes as generated.
  execFileSync(path.join(root, 'node_modules', '.bin', 'oxfmt'), [outFile], { stdio: 'ignore' });
  process.stdout.write(
    `\nid       source            raw DEM        lap rise  name\n${rows.join('\n')}\n\nwrote ${path.relative(process.cwd(), outFile)} (${elevations.length} circuits)\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
