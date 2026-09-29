import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  deriveLaps,
  deriveRaceControl,
  deriveResults,
  deriveStints,
  withTiming,
} from '../src/data/replay-derive.ts';
import type {
  OpenF1Compounds,
  OpenF1RaceControl,
  OpenF1Timing,
  RawLap,
  RawOpenF1Driver,
  RawOpenF1Lap,
  RawOpenF1RaceControl,
  RawOpenF1Stint,
  RawPitStop,
  RawResult,
  RawTiming,
} from '../src/data/replay-derive.ts';
import {
  CLASSIC_RACES,
  REPLAY_SEASONS,
  notOnDisk,
  raceId,
  seasonSelections,
} from '../src/data/replay-list.ts';
import type { ReplaySelection } from '../src/data/replay-list.ts';
import {
  replayIndexSchema,
  replayRaceSchema,
  type ReplayDriver,
  type ReplayDriverStints,
  type ReplayIndexEntry,
  type ReplayLap,
  type ReplayOpenF1Source,
  type ReplayRace,
  type ReplayTeam,
} from '../src/data/replay-schema.ts';
import { teamColour } from '../src/data/team-colours.ts';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1';
// jolpica blocks the default runtime user agent and asks callers to identify themselves.
const USER_AGENT = 'react-boxbox-replays/0.1 (+https://react-boxbox.vercel.app)';
// The published unauthenticated budget is 4 requests/second and 500/hour. Two per second still
// tripped Cloudflare's rate limiter (error 1015) on a back-to-back rebuild, so stay under one
// per second. A race is 15 to 20 requests, so a whole season can outrun the hourly budget: the
// run skips the races already on disk, and a rerun after a 429 carries on where it stopped.
const THROTTLE_MS = 1100;
const PAGE_SIZE = 100;

// OpenF1 supplies the tyre compound per stint. No key, and the published budget is 3 requests a
// second and 30 a minute, so its own throttle sits just above the tighter of the two. It is a
// second source for one field: a race whose compounds cannot be fetched is still written.
const OPENF1_BASE_URL = 'https://api.openf1.org/v1';
const OPENF1_THROTTLE_MS = 2100;
/** OpenF1's coverage starts in 2023; earlier seasons are written with no compounds at all. */
const OPENF1_FROM_SEASON = 2023;
/** How far a meeting may start from the race date and still be that race's weekend. */
const MEETING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

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
  round?: string;
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

type OpenF1Meeting = {
  meeting_key: number;
  meeting_name?: string;
  circuit_short_name?: string;
  date_start?: string;
  is_cancelled?: boolean;
};
type OpenF1Session = { session_key: number; session_name?: string };

/** Thrown when the compounds cannot be fetched. The race is still written, without them. */
class OpenF1Unavailable extends Error {}

let openF1RequestCount = 0;
let openF1LastRequestAt = 0;
/** A 429 stops OpenF1 for the rest of the run rather than hammering a limiter race after race. */
let openF1Stopped: string | null = null;

/**
 * One OpenF1 request. Every endpoint used here answers with an array; the API replies
 * `{"detail":"No results found."}` for an empty selection, which is read as no rows.
 */
async function openF1Request<T>(query: string): Promise<T[]> {
  if (openF1Stopped !== null) throw new OpenF1Unavailable(openF1Stopped);

  const url = `${OPENF1_BASE_URL}${query}`;
  const wait = OPENF1_THROTTLE_MS - (Date.now() - openF1LastRequestAt);
  if (wait > 0) await sleep(wait);
  openF1LastRequestAt = Date.now();
  openF1RequestCount += 1;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (response.status === 429) {
    openF1Stopped = `429 from OpenF1 (${url}). Its limits are 3 requests/second and 30/minute; compounds are skipped for the rest of this run.`;
    throw new OpenF1Unavailable(openF1Stopped);
  }
  if (!response.ok) {
    throw new OpenF1Unavailable(`${response.status} ${response.statusText} from ${url}`);
  }

  const body: unknown = await response.json();
  return Array.isArray(body) ? (body as T[]) : [];
}

/** Meetings are fetched once per season per run: a whole season shares one request. */
const meetingsBySeason = new Map<number, OpenF1Meeting[]>();
async function openF1Meetings(season: number): Promise<OpenF1Meeting[]> {
  const cached = meetingsBySeason.get(season);
  if (cached) return cached;
  const meetings = await openF1Request<OpenF1Meeting>(`/meetings?year=${season}`);
  meetingsBySeason.set(season, meetings);
  return meetings;
}

const NAME_STOP_WORDS = new Set(['grand', 'prix']);

/** The words of a race name worth matching a circuit or meeting name against. */
function raceWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 3 && !NAME_STOP_WORDS.has(word));
}

/**
 * The meeting a race belongs to.
 *
 * By date: a meeting starts on the Friday and the race is on the Sunday, so the closest
 * `date_start` within three days of the race is the weekend. Country and circuit names differ
 * too often between the two sources to key on (`country_name` on `/sessions` is unreliable), so
 * a name match is only the fallback when no date lands in the window.
 */
function pickMeeting(meetings: readonly OpenF1Meeting[], race: RaceInfo): OpenF1Meeting | null {
  const raceAt = Date.parse(`${race.date}T12:00:00Z`);
  let best: OpenF1Meeting | null = null;
  let closest = Number.POSITIVE_INFINITY;

  for (const meeting of meetings) {
    if (meeting.is_cancelled === true) continue;
    const start = meeting.date_start === undefined ? Number.NaN : Date.parse(meeting.date_start);
    if (!Number.isFinite(start)) continue;
    const distance = Math.abs(start - raceAt);
    if (distance > MEETING_WINDOW_MS || distance >= closest) continue;
    best = meeting;
    closest = distance;
  }
  if (best) return best;

  const words = raceWords(race.raceName);
  return (
    meetings.find((meeting) => {
      const haystack =
        `${meeting.meeting_name ?? ''} ${meeting.circuit_short_name ?? ''}`.toLowerCase();
      return words.some((word) => haystack.includes(word));
    }) ?? null
  );
}

/**
 * The race session for one race, and its driver list: the join key for everything OpenF1 adds.
 * Resolved once per race, because compounds and timing both hang off it.
 */
async function fetchOpenF1Session(
  season: number,
  info: RaceInfo,
): Promise<{ sessionKey: number; drivers: RawOpenF1Driver[]; meeting: string }> {
  const meeting = pickMeeting(await openF1Meetings(season), info);
  if (meeting === null) {
    throw new OpenF1Unavailable(`no OpenF1 meeting within 3 days of ${info.date}`);
  }

  const sessions = await openF1Request<OpenF1Session>(
    `/sessions?meeting_key=${meeting.meeting_key}&session_name=Race`,
  );
  const sessionKey = sessions[0]?.session_key;
  if (sessionKey === undefined) {
    throw new OpenF1Unavailable(`no race session for meeting ${meeting.meeting_key}`);
  }

  const drivers = await openF1Request<RawOpenF1Driver>(`/drivers?session_key=${sessionKey}`);
  return {
    sessionKey,
    drivers,
    meeting: `${meeting.meeting_name ?? meeting.circuit_short_name ?? '?'} (${meeting.meeting_key}/${sessionKey})`,
  };
}

const raceUrl = ({ season, round }: ReplaySelection, resource = '') =>
  `${BASE_URL}/${season}/${round}${resource}.json`;

async function fetchRaceInfo(selection: ReplaySelection): Promise<RaceInfo | null> {
  const payload = await request(raceUrl(selection));
  const race = payload.MRData.RaceTable.Races[0];
  if (race?.raceName === undefined || race.date === undefined || race.Circuit === undefined) {
    return null;
  }
  return { raceName: race.raceName, date: race.date, Circuit: race.Circuit };
}

type Planned = { selection: ReplaySelection; info: RaceInfo };

/**
 * The rounds of a season that have a result, with each race's info, in one request: the
 * winners' rows (`results/1`) carry the race name, circuit and date too, so a season costs one
 * request to plan however many rounds it has run.
 */
async function fetchSeasonRaces(season: number): Promise<Planned[]> {
  const payload = await request(`${BASE_URL}/${season}/results/1.json?limit=${PAGE_SIZE}`);
  const races = payload.MRData.RaceTable.Races;
  const planned: Planned[] = [];
  for (const selection of seasonSelections(season, races)) {
    const race = races.find((entry) => entry.round === String(selection.round));
    if (race?.raceName === undefined || race.date === undefined || race.Circuit === undefined) {
      continue;
    }
    planned.push({
      selection,
      info: { raceName: race.raceName, date: race.date, Circuit: race.Circuit },
    });
  }
  return planned;
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

type OpenF1ForRace = {
  compounds?: OpenF1Compounds;
  compoundSource?: ReplayOpenF1Source;
  timing?: OpenF1Timing;
  timingSource?: ReplayOpenF1Source;
  raceControl?: OpenF1RaceControl;
  raceControlSource?: ReplayOpenF1Source;
  meeting: string;
};

/**
 * Everything OpenF1 adds to a race, when the season has it and the API answers: the stint
 * compounds and the per-lap timing. The two are fetched separately on purpose, so a failure on
 * one does not lose the other, and any failure at all is logged and the race is written without
 * that field. Nothing jolpica provides depends on either.
 */
async function openF1For(
  selection: ReplaySelection,
  info: RaceInfo,
  drivers: readonly ReplayDriver[],
  fetchedAt: string,
): Promise<OpenF1ForRace> {
  if (selection.season < OPENF1_FROM_SEASON) {
    return { meeting: `none (before ${OPENF1_FROM_SEASON})` };
  }

  const codes = drivers.map((driver) => ({ id: driver.id, code: driver.code }));
  const warn = (what: string, error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`  ! ${raceId(selection)}: no ${what} (${reason})`);
  };

  let session: Awaited<ReturnType<typeof fetchOpenF1Session>>;
  try {
    session = await fetchOpenF1Session(selection.season, info);
  } catch (error) {
    warn('compounds or timing', error);
    return { meeting: 'failed' };
  }

  const found: OpenF1ForRace = { meeting: session.meeting };

  try {
    const url = `${OPENF1_BASE_URL}/stints?session_key=${session.sessionKey}`;
    const stints = await openF1Request<RawOpenF1Stint>(`/stints?session_key=${session.sessionKey}`);
    if (stints.length === 0) {
      throw new OpenF1Unavailable(`no stints published for session ${session.sessionKey}`);
    }
    found.compounds = { drivers: session.drivers, stints, codes };
    found.compoundSource = { provider: 'openf1', fetchedAt, url };
  } catch (error) {
    warn('compounds', error);
  }

  try {
    // One request covers the whole race: `laps` is a row per car per lap.
    const url = `${OPENF1_BASE_URL}/laps?session_key=${session.sessionKey}`;
    const laps = await openF1Request<RawOpenF1Lap>(`/laps?session_key=${session.sessionKey}`);
    if (laps.length === 0) {
      throw new OpenF1Unavailable(`no laps published for session ${session.sessionKey}`);
    }
    found.timing = { drivers: session.drivers, laps, codes };
    found.timingSource = { provider: 'openf1', fetchedAt, url };
  } catch (error) {
    warn('timing', error);
  }

  try {
    // One request covers the whole race: `race_control` is a row per message, 181 of them for
    // 2026-14. The messages are dated in wall clock, so they are placed on the replay's own clock
    // against lap 1 of the `laps` payload above; without that payload none of them can be timed.
    const url = `${OPENF1_BASE_URL}/race_control?session_key=${session.sessionKey}`;
    const messages = await openF1Request<RawOpenF1RaceControl>(
      `/race_control?session_key=${session.sessionKey}`,
    );
    if (messages.length === 0) {
      throw new OpenF1Unavailable(`no race control published for session ${session.sessionKey}`);
    }
    found.raceControl = {
      drivers: session.drivers,
      messages,
      laps: found.timing?.laps ?? [],
      codes,
    };
    found.raceControlSource = { provider: 'openf1', fetchedAt, url };
  } catch (error) {
    warn('race control', error);
  }

  return found;
}

/** How much of a race's stint data carries a compound. */
function compoundCoverage(stints: readonly ReplayDriverStints[]) {
  const total = stints.reduce((count, car) => count + car.stints.length, 0);
  const known = stints.reduce(
    (count, car) => count + car.stints.filter((stint) => stint.compound !== null).length,
    0,
  );
  return { cars: stints.length, total, known };
}

/** How many lap rows carry sector times and a speed-trap reading. */
function timingCoverage(laps: readonly ReplayLap[]) {
  let rows = 0;
  let sectors = 0;
  let speeds = 0;
  for (const lap of laps) {
    for (const row of lap.rows) {
      rows += 1;
      if (row.sectorMs.some((ms) => ms !== null)) sectors += 1;
      if (row.speedTrapKph !== null) speeds += 1;
    }
  }
  return { rows, sectors, speeds };
}

async function buildRace(
  selection: ReplaySelection,
  info: RaceInfo,
  fetchedAt: string,
): Promise<{ race: ReplayRace; meeting: string; control: string } | null> {
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
  const derived = deriveLaps(rawLaps, pitStops);
  const classification = deriveResults(results);

  const openF1 = await openF1For(selection, info, drivers, fetchedAt);
  const laps = openF1.timing ? withTiming(derived, openF1.timing) : derived;

  const control = openF1.raceControl
    ? deriveRaceControl(openF1.raceControl)
    : { messages: [], dropped: 0 };
  if (control.dropped > 0) {
    // Everything race control said before the lights went out — formation lap, pit-lane opening,
    // the hours of practice the session covers — has no place on a clock that starts at the race.
    console.warn(
      `  ! ${raceId(selection)}: dropped ${control.dropped} race-control message(s) with no resolvable race time`,
    );
  }

  const race = replayRaceSchema.parse({
    id: raceId(selection),
    season,
    round,
    name: info.raceName,
    circuit: info.Circuit.circuitName,
    date: info.date,
    totalLaps: Math.max(...laps.map((lap) => lap.lap)),
    source: {
      provider: 'jolpica-f1',
      fetchedAt,
      url: raceUrl(selection),
      compounds: openF1.compoundSource,
      timing: openF1.timingSource,
      raceControl: control.messages.length > 0 ? openF1.raceControlSource : undefined,
    },
    drivers,
    teams,
    laps,
    results: classification,
    stints: deriveStints(laps, classification, openF1.compounds),
    raceControl: control.messages,
  } satisfies ReplayRace);

  const fetched = openF1.raceControl?.messages.length ?? 0;
  return {
    race,
    meeting: openF1.meeting,
    control: fetched === 0 ? '—' : `${control.messages.length}/${fetched}`,
  };
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

const RACE_FILE = /^\d{4}-\d{1,2}\.json$/;

async function raceFilesOnDisk(): Promise<string[]> {
  try {
    return (await readdir(outDir)).filter((name) => RACE_FILE.test(name));
  } catch {
    return [];
  }
}

/**
 * The index is rebuilt from every race file on disk rather than patched, so a race skipped
 * because it is already there, or written by a run a 429 cut short, is listed all the same.
 */
async function writeIndex(generatedAt: string): Promise<string> {
  const entries: ReplayIndexEntry[] = [];
  for (const name of await raceFilesOnDisk()) {
    const file = await readFile(path.join(outDir, name), 'utf8');
    entries.push(indexEntry(replayRaceSchema.parse(JSON.parse(file))));
  }
  const index = replayIndexSchema.parse({
    generatedAt,
    races: entries.sort((a, b) => b.date.localeCompare(a.date)),
  });
  const indexJson = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(path.join(outDir, 'index.json'), indexJson);
  return indexJson;
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

/**
 * What a run fetches. `--only <id>` rebuilds that one race even when it is on disk. `--season
 * <year>` takes the rounds of that season with a result; no flag takes every classic race and
 * every full season. Those two skip the races already on disk, so rerunning after each grand
 * prix, or after a 429, only fetches what is missing: delete a file to fetch it again.
 * Returns the reason instead when the flags name nothing curated.
 */
async function planRun(args: readonly string[]): Promise<Planned[] | string> {
  const only = flagValue(args, '--only');
  const seasonFlag = flagValue(args, '--season');

  if (only !== undefined) {
    const [season = Number.NaN, round = Number.NaN] = only
      .split('-')
      .map((part) => Number.parseInt(part, 10));
    const selection = { season, round };
    const curated =
      raceId(selection) === only &&
      (REPLAY_SEASONS.includes(season) || CLASSIC_RACES.some((race) => raceId(race) === only));
    if (!curated) {
      return `No curated race matches --only ${only}. Classics: ${CLASSIC_RACES.map(raceId).join(', ')}; full seasons: ${REPLAY_SEASONS.join(', ')}.`;
    }
    const info = await fetchRaceInfo(selection);
    return info === null ? `${only}: unknown race on jolpica.` : [{ selection, info }];
  }

  let seasons = REPLAY_SEASONS;
  let classics = CLASSIC_RACES;
  if (seasonFlag !== undefined) {
    const season = Number.parseInt(seasonFlag, 10);
    if (!REPLAY_SEASONS.includes(season)) {
      return `--season ${seasonFlag} is not a full season. Full seasons: ${REPLAY_SEASONS.join(', ')}; earlier races go in CLASSIC_RACES.`;
    }
    seasons = [season];
    classics = [];
  }

  const onDisk = await raceFilesOnDisk();
  const planned: Planned[] = [];
  for (const selection of notOnDisk(classics, onDisk)) {
    const info = await fetchRaceInfo(selection);
    if (info === null) {
      console.warn(`  ! ${raceId(selection)}: unknown race, skipping`);
      continue;
    }
    planned.push({ selection, info });
  }
  for (const season of seasons) {
    const races = await fetchSeasonRaces(season);
    const missing = new Set(
      notOnDisk(
        races.map((race) => race.selection),
        onDisk,
      ).map(raceId),
    );
    console.log(`${season}: ${races.length} round(s) with a result, ${missing.size} not on disk`);
    planned.push(...races.filter((race) => missing.has(raceId(race.selection))));
  }
  return planned;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const planned = await planRun(args);
  if (typeof planned === 'string') {
    console.error(planned);
    process.exitCode = 1;
    return;
  }

  console.log(`Selected ${planned.length} race(s) to fetch:`);
  for (const { selection, info } of planned) {
    console.log(
      `  ${raceId(selection).padEnd(8)} ${info.raceName} — ${info.Circuit.circuitName} — ${info.date}`,
    );
  }

  if (dryRun) {
    console.log(`\nDry run: would write ${planned.length} race file(s) plus index.json.`);
    console.log(`Requests made while planning: ${requestCount}.`);
    return;
  }
  if (planned.length === 0) {
    console.log('\nNothing to fetch: every selected race is already on disk.');
    return;
  }

  await mkdir(outDir, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const summary: {
    id: string;
    laps: number;
    drivers: number;
    requests: number;
    bytes: number;
    stints: string;
    compounds: string;
    timing: string;
    control: string;
    meeting: string;
  }[] = [];

  // A 429 ends the run, but only after the races it did write are in the index.
  let aborted: FetchAbort | undefined;
  try {
    for (const { selection, info } of planned) {
      const before = requestCount + openF1RequestCount;
      const built = await buildRace(selection, info, fetchedAt);
      if (built === null) continue;
      const { race, meeting, control } = built;

      const json = `${JSON.stringify(race, null, 2)}\n`;
      await writeFile(path.join(outDir, `${race.id}.json`), json);
      const coverage = compoundCoverage(race.stints);
      const timed = timingCoverage(race.laps);
      summary.push({
        id: race.id,
        laps: race.totalLaps,
        drivers: race.drivers.length,
        requests: requestCount + openF1RequestCount - before,
        bytes: byteLength(json),
        stints: `${coverage.total} over ${coverage.cars} cars`,
        compounds: `${coverage.known}/${coverage.total}`,
        timing: `${timed.sectors}+${timed.speeds}/${timed.rows}`,
        control,
        meeting,
      });
      console.log(`  wrote ${race.id}.json`);
    }
  } catch (error) {
    if (!(error instanceof FetchAbort)) throw error;
    aborted = error;
  }

  const indexJson = await writeIndex(fetchedAt);

  const bytes = summary.reduce((total, row) => total + row.bytes, 0) + byteLength(indexJson);
  // `timing` reads sectors+speedTrap over the race's lap rows; `control` reads the race-control
  // messages kept over the messages fetched, so a race losing many to the clock is visible.
  console.log(
    '\nrace        laps  drivers  requests     bytes  stints             compounds  timing          control    meeting',
  );
  for (const row of summary) {
    console.log(
      `${row.id.padEnd(10)}  ${String(row.laps).padStart(4)}  ${String(row.drivers).padStart(7)}  ${String(row.requests).padStart(8)}  ${String(row.bytes).padStart(8)}  ${row.stints.padEnd(17)}  ${row.compounds.padEnd(9)}  ${row.timing.padEnd(14)}  ${row.control.padEnd(9)}  ${row.meeting}`,
    );
  }
  console.log(
    `\n${summary.length} race(s), ${requestCount} jolpica + ${openF1RequestCount} OpenF1 requests, ${bytes} bytes written.`,
  );
  if (openF1Stopped !== null) console.warn(`\n${openF1Stopped}`);
  if (aborted) throw aborted;
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
