import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { deriveLaps, deriveResults } from '../src/data/replay-derive.ts';
import type { RawLap, RawPitStop, RawResult, RawTiming } from '../src/data/replay-derive.ts';
import { REPLAY_LIST } from '../src/data/replay-list.ts';
import type { ReplaySelection } from '../src/data/replay-list.ts';
import {
  replayIndexSchema,
  replayRaceSchema,
  type ReplayDriver,
  type ReplayIndexEntry,
  type ReplayRace,
  type ReplayTeam,
} from '../src/data/replay-schema.ts';
import { teamColour } from '../src/data/team-colours.ts';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1';
// jolpica blocks the default runtime user agent and asks callers to identify themselves.
const USER_AGENT = 'react-boxbox-replays/0.1 (+https://react-boxbox.vercel.app)';
// The published unauthenticated budget is 4 requests/second and 500/hour. Two per second still
// tripped Cloudflare's rate limiter (error 1015) on a back-to-back rebuild, so stay under one
// per second. A full rebuild is around 70 requests: a couple of minutes costs nothing.
const THROTTLE_MS = 1100;
const PAGE_SIZE = 100;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'public', 'data', 'replays');

type RaceInfo = {
  raceName: string;
  date: string;
  Circuit: { circuitName: string };
};
type ApiDriver = {
  driverId: string;
  code?: string;
  permanentNumber?: string;
  givenName: string;
  familyName: string;
};
type ApiResult = RawResult & {
  number: string;
  Driver: ApiDriver;
  Constructor: { constructorId: string; name: string };
};
type ApiRace = Partial<RaceInfo> & {
  Laps?: RawLap[];
  PitStops?: RawPitStop[];
  Results?: ApiResult[];
};
type ApiResponse = { MRData: { total: string; RaceTable: { Races: ApiRace[] } } };

/** Thrown when the API tells us to back off. It ends the run rather than retrying in a loop. */
class FetchAbort extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const byteLength = (value: string) => new TextEncoder().encode(value).length;

let requestCount = 0;
let lastRequestAt = 0;

async function request(url: string): Promise<ApiResponse> {
  const wait = THROTTLE_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    lastRequestAt = Date.now();
    requestCount += 1;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });

    if (response.status === 429 || response.status === 403) {
      const body = (await response.text()).slice(0, 500);
      throw new FetchAbort(
        `${response.status} ${response.statusText} from ${url}. Stopping rather than retrying.\n${body}`,
      );
    }
    if (response.status >= 500) {
      if (attempt === 0) {
        console.warn(`  ${response.status} from ${url}, retrying once in 2s`);
        await sleep(2000);
        continue;
      }
      throw new FetchAbort(`${response.status} ${response.statusText} from ${url} after a retry.`);
    }
    if (!response.ok) throw new FetchAbort(`${response.status} ${response.statusText} from ${url}`);

    return (await response.json()) as ApiResponse;
  }
  throw new FetchAbort(`Unreachable: ${url}`);
}

const raceUrl = ({ season, round }: ReplaySelection, resource = '') =>
  `${BASE_URL}/${season}/${round}${resource}.json`;

const raceId = ({ season, round }: ReplaySelection) => `${season}-${round}`;

async function fetchRaceInfo(selection: ReplaySelection): Promise<RaceInfo | null> {
  const payload = await request(raceUrl(selection));
  const race = payload.MRData.RaceTable.Races[0];
  if (race?.raceName === undefined || race.date === undefined || race.Circuit === undefined) {
    return null;
  }
  return { raceName: race.raceName, date: race.date, Circuit: race.Circuit };
}

/** `total` on the laps and pitstops endpoints counts rows, not laps, so paginate over rows. */
async function fetchPaged<T>(
  selection: ReplaySelection,
  resource: '/laps' | '/pitstops',
  collect: (race: ApiRace) => T[],
  onPage: (items: T[]) => void,
): Promise<number> {
  const url = raceUrl(selection, resource);
  const first = await request(`${url}?limit=${PAGE_SIZE}&offset=0`);
  const total = Number.parseInt(first.MRData.total, 10);

  const firstRace = first.MRData.RaceTable.Races[0];
  if (firstRace) onPage(collect(firstRace));

  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
    const page = await request(`${url}?limit=${PAGE_SIZE}&offset=${offset}`);
    const race = page.MRData.RaceTable.Races[0];
    if (race) onPage(collect(race));
  }
  return total;
}

/** A lap's timings can straddle a page boundary, so pages are merged by lap number. */
function mergeLaps(target: Map<number, RawTiming[]>, laps: RawLap[]) {
  for (const lap of laps) {
    const number = Number.parseInt(lap.number, 10);
    const existing = target.get(number);
    if (existing) existing.push(...lap.Timings);
    else target.set(number, [...lap.Timings]);
  }
}

function driversAndTeams(season: number, results: ApiResult[]) {
  const drivers: ReplayDriver[] = [];
  const teams = new Map<string, ReplayTeam>();

  for (const result of results) {
    const { Driver: driver, Constructor: constructor } = result;
    teams.set(constructor.constructorId, {
      id: constructor.constructorId,
      name: constructor.name,
      color: teamColour(season, constructor.constructorId),
    });
    drivers.push({
      id: driver.driverId,
      code: driver.code ?? driver.familyName.slice(0, 3).toUpperCase(),
      number: Number.parseInt(driver.permanentNumber ?? result.number, 10) || 0,
      firstName: driver.givenName,
      lastName: driver.familyName,
      teamId: constructor.constructorId,
    });
  }

  return { drivers, teams: [...teams.values()] };
}

async function buildRace(
  selection: ReplaySelection,
  info: RaceInfo,
  fetchedAt: string,
): Promise<ReplayRace | null> {
  const { season, round } = selection;

  const resultsPayload = await request(raceUrl(selection, '/results'));
  const results = resultsPayload.MRData.RaceTable.Races[0]?.Results ?? [];
  if (results.length === 0) {
    console.warn(`  ! ${raceId(selection)}: no results published, skipping`);
    return null;
  }

  const lapRows = new Map<number, RawTiming[]>();
  const lapTotal = await fetchPaged(
    selection,
    '/laps',
    (race) => race.Laps ?? [],
    (laps) => mergeLaps(lapRows, laps),
  );
  if (lapTotal === 0 || lapRows.size === 0) {
    console.warn(`  ! ${raceId(selection)}: no lap timings published, skipping`);
    return null;
  }

  const pitStops: RawPitStop[] = [];
  await fetchPaged(
    selection,
    '/pitstops',
    (race) => race.PitStops ?? [],
    (stops) => pitStops.push(...stops),
  );

  const rawLaps: RawLap[] = [...lapRows.entries()].map(([number, Timings]) => ({
    number: String(number),
    Timings,
  }));
  const { drivers, teams } = driversAndTeams(season, results);
  const laps = deriveLaps(rawLaps, pitStops);

  return replayRaceSchema.parse({
    id: raceId(selection),
    season,
    round,
    name: info.raceName,
    circuit: info.Circuit.circuitName,
    date: info.date,
    totalLaps: Math.max(...laps.map((lap) => lap.lap)),
    source: { provider: 'jolpica-f1', fetchedAt, url: raceUrl(selection) },
    drivers,
    teams,
    laps,
    results: deriveResults(results),
  } satisfies ReplayRace);
}

function indexEntry(race: ReplayRace): ReplayIndexEntry {
  const winner = race.results.find((result) => result.position === 1);
  const driver = race.drivers.find((entry) => entry.id === winner?.driverId);
  return {
    id: race.id,
    season: race.season,
    round: race.round,
    name: race.name,
    circuit: race.circuit,
    date: race.date,
    totalLaps: race.totalLaps,
    driverCount: race.drivers.length,
    winnerCode: driver?.code ?? '???',
  };
}

/** A `--only` rebuild must keep the races it did not touch in the index. */
async function readExistingIndex(): Promise<ReplayIndexEntry[]> {
  try {
    const file = await readFile(path.join(outDir, 'index.json'), 'utf8');
    return replayIndexSchema.parse(JSON.parse(file)).races;
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyFlag = args.indexOf('--only');
  const only = onlyFlag === -1 ? undefined : args[onlyFlag + 1];

  const selections = only ? REPLAY_LIST.filter((entry) => raceId(entry) === only) : REPLAY_LIST;
  if (selections.length === 0) {
    console.error(
      `No curated race matches --only ${only}. Known: ${REPLAY_LIST.map(raceId).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Selected ${selections.length} race(s) from the curated list:`);
  const planned: { selection: ReplaySelection; info: RaceInfo }[] = [];
  for (const selection of selections) {
    const info = await fetchRaceInfo(selection);
    if (info === null) {
      console.warn(`  ! ${raceId(selection)}: unknown race, skipping`);
      continue;
    }
    console.log(
      `  ${raceId(selection).padEnd(8)} ${info.raceName} — ${info.Circuit.circuitName} — ${info.date}`,
    );
    planned.push({ selection, info });
  }

  if (dryRun) {
    console.log(`\nDry run: would write ${planned.length} race file(s) plus index.json.`);
    console.log(`Requests made while planning: ${requestCount}.`);
    return;
  }

  await mkdir(outDir, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const summary: { id: string; laps: number; drivers: number; requests: number; bytes: number }[] =
    [];
  const races: ReplayRace[] = [];

  for (const { selection, info } of planned) {
    const before = requestCount;
    const race = await buildRace(selection, info, fetchedAt);
    if (race === null) continue;

    const json = `${JSON.stringify(race, null, 2)}\n`;
    await writeFile(path.join(outDir, `${race.id}.json`), json);
    races.push(race);
    summary.push({
      id: race.id,
      laps: race.totalLaps,
      drivers: race.drivers.length,
      requests: requestCount - before,
      bytes: byteLength(json),
    });
    console.log(`  wrote ${race.id}.json`);
  }

  const kept = (await readExistingIndex()).filter(
    (entry) => !races.some((race) => race.id === entry.id),
  );
  const index = replayIndexSchema.parse({
    generatedAt: fetchedAt,
    races: [...kept, ...races.map(indexEntry)].sort((a, b) => b.date.localeCompare(a.date)),
  });
  const indexJson = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(path.join(outDir, 'index.json'), indexJson);

  const bytes = summary.reduce((total, row) => total + row.bytes, 0) + byteLength(indexJson);
  console.log('\nrace        laps  drivers  requests     bytes');
  for (const row of summary) {
    console.log(
      `${row.id.padEnd(10)}  ${String(row.laps).padStart(4)}  ${String(row.drivers).padStart(7)}  ${String(row.requests).padStart(8)}  ${String(row.bytes).padStart(8)}`,
    );
  }
  console.log(`\n${summary.length} race(s), ${requestCount} requests, ${bytes} bytes written.`);
}

try {
  await main();
} catch (error) {
  if (error instanceof FetchAbort) {
    console.error(`\nAborted after ${requestCount} requests: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
