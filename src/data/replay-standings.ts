import type { TimingRow } from '@/registry/boxbox/lib/types';
import type { StandingsEntry } from '@/registry/boxbox/ui/standings';
import type { ReplayRace } from './replay-schema';
import { teamColour } from './team-colours';

/**
 * The championship around a replay race: the standings before it, the projected standings at
 * race time, and the official standings after it. Everything here is pure, like the other replay
 * helpers, so the page can call it whenever the order of the cars in the points changes.
 *
 * The dataset only stores the standings **after** the round. The standings before the race are
 * those less the points each driver and team scored in this race's own results, so a sprint run
 * the same weekend counts as before, which is when it ran.
 */

/** Points for P1 to P10 at a grand prix. The projection adds no fastest-lap bonus. */
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

/** The points a finishing position is worth; nothing outside the top ten. */
export function racePoints(position: number): number {
  return RACE_POINTS[position - 1] ?? 0;
}

export type StandingsTable = 'drivers' | 'teams';
export const STANDINGS_TABLES: readonly StandingsTable[] = ['drivers', 'teams'];

/** Both tables, ranked, ready for the `Standings` component. */
export type StandingsTables = Record<StandingsTable, StandingsEntry[]>;

/** One line of a table as the helpers rank it: `wins` only ever breaks a tie. */
type Line = { id: string; name: string; color: string; points: number; wins: number };

/** A line of the standings before a race, with the place it held then: what a projection adds to. */
export type StandingsLine = Line & { position: number };
type BeforeLine = StandingsLine;

/**
 * The cars that would score if the race ended now, in race order: the running cars of the tower's
 * rows, cut to the ten places that pay. A car out of the race scores nothing and is left out.
 */
export function pointScorers(
  rows: readonly Pick<TimingRow, 'driverId' | 'position' | 'finishStatus'>[],
): string[] {
  return rows
    .filter((row) => (row.finishStatus ?? 'finished') === 'finished')
    .sort((a, b) => a.position - b.position)
    .slice(0, RACE_POINTS.length)
    .map((row) => row.driverId);
}

/**
 * Ranks lines the way the championship does as far as the dataset allows: points, then wins,
 * then `tieBreak` (lower first). The real tie-break goes on to second places, third places and
 * so on, which the dataset does not carry.
 */
function rank<T extends Line>(lines: readonly T[], tieBreak: (line: T) => number): T[] {
  return [...lines].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || tieBreak(a) - tieBreak(b),
  );
}

/** The points each car in `scorers` (see `pointScorers`) is worth at its place. */
export function scorerPoints(scorers: readonly string[]): Map<string, number> {
  return new Map(scorers.map((id, index) => [id, racePoints(index + 1)]));
}

/** What each team scores: the sum of its cars' points, `teamOf` mapping a car to its team. */
export function teamPoints(
  driverPoints: ReadonlyMap<string, number>,
  teamOf: (driverId: string) => string | undefined,
): Map<string, number> {
  const teams = new Map<string, number>();
  for (const [id, points] of driverPoints) {
    const teamId = teamOf(id);
    if (teamId !== undefined) teams.set(teamId, (teams.get(teamId) ?? 0) + points);
  }
  return teams;
}

/**
 * Standings projected from `before`: each line plus what `gains` holds for it, `wonBy` counting a
 * win, ranked by points, then wins, then the order before. Every entry carries what it gained and
 * its change of place.
 */
export function projectStandings(
  before: readonly StandingsLine[],
  gains: ReadonlyMap<string, number>,
  wonBy?: string,
): StandingsEntry[] {
  const projected = before.map((line) => {
    const gained = gains.get(line.id) ?? 0;
    return {
      ...line,
      points: line.points + gained,
      wins: line.wins + (line.id === wonBy ? 1 : 0),
      gained,
    };
  });
  return rank(projected, (line) => line.position).map(
    ({ wins: _wins, position: was, ...line }, index) => ({
      ...line,
      position: index + 1,
      positionChange: was - (index + 1),
    }),
  );
}

/** The race's winner: the car classified first, when there is one. */
function winnerOf(race: ReplayRace): string | undefined {
  return race.results.find((result) => result.position === 1 && result.finishStatus === 'finished')
    ?.driverId;
}

/** Derived from the race alone, so built once per race object and looked up by identity. */
const BEFORE = new WeakMap<ReplayRace, Record<StandingsTable, BeforeLine[]>>();

/** Ranks a line the standings leave out below every line they carry. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * Both tables before the race, ranked, or `null` for a race without standings.
 *
 * Wins lose this race's win the same way points lose its points. Two lines level on points and
 * wins keep the order of the standings after the race, the nearest the dataset has to the real
 * count-back. A car in the race that the standings leave out starts on nothing, below the rest.
 */
function before(race: ReplayRace): Record<StandingsTable, BeforeLine[]> | null {
  const { standings } = race;
  if (standings === null) return null;
  const cached = BEFORE.get(race);
  if (cached) return cached;

  const teams = new Map(race.teams.map((team) => [team.id, team]));
  const drivers = new Map(race.drivers.map((driver) => [driver.id, driver]));
  const colourOf = (teamId: string) => teams.get(teamId)?.color ?? teamColour(race.season, teamId);
  const scored = new Map(race.results.map((result) => [result.driverId, result.points]));
  const winner = winnerOf(race);
  const winningTeam = winner === undefined ? undefined : drivers.get(winner)?.teamId;

  const driverLines = standings.drivers.map((line) => {
    const driver = drivers.get(line.driverId);
    return {
      id: line.driverId,
      name: driver?.code ?? line.code,
      color: colourOf(driver?.teamId ?? line.constructorId),
      points: line.points - (scored.get(line.driverId) ?? 0),
      wins: Math.max(0, line.wins - (line.driverId === winner ? 1 : 0)),
      after: line.position,
    };
  });
  for (const driver of race.drivers) {
    if (driverLines.some((line) => line.id === driver.id)) continue;
    driverLines.push({
      id: driver.id,
      name: driver.code,
      color: colourOf(driver.teamId),
      points: 0,
      wins: 0,
      after: UNRANKED,
    });
  }

  const teamScored = new Map<string, number>();
  for (const result of race.results) {
    const teamId = drivers.get(result.driverId)?.teamId;
    if (teamId !== undefined) teamScored.set(teamId, (teamScored.get(teamId) ?? 0) + result.points);
  }
  const teamLines = standings.teams.map((line) => ({
    id: line.constructorId,
    name: line.name,
    color: colourOf(line.constructorId),
    points: line.points - (teamScored.get(line.constructorId) ?? 0),
    wins: Math.max(0, line.wins - (line.constructorId === winningTeam ? 1 : 0)),
    after: line.position,
  }));
  for (const team of race.teams) {
    if (teamLines.some((line) => line.id === team.id)) continue;
    teamLines.push({
      id: team.id,
      name: team.name,
      color: team.color,
      points: 0,
      wins: 0,
      after: UNRANKED,
    });
  }

  const ranked = (lines: (Line & { after: number })[]): BeforeLine[] =>
    rank(lines, (line) => line.after).map(({ after: _after, ...line }, index) => ({
      ...line,
      position: index + 1,
    }));
  const tables = { drivers: ranked(driverLines), teams: ranked(teamLines) };
  BEFORE.set(race, tables);
  return tables;
}

/** The table's entries with nothing scored: the standings before the race. */
export function standingsBefore(race: ReplayRace): StandingsTables | null {
  const lines = before(race);
  if (lines === null) return null;
  const entries = (table: BeforeLine[]) =>
    table.map(({ wins: _wins, ...line }) => ({ ...line, gained: 0, positionChange: 0 }));
  return { drivers: entries(lines.drivers), teams: entries(lines.teams) };
}

/**
 * The projected standings: the standings before the race plus the points each car's place in
 * `scorers` (see `pointScorers`) is worth, a team scoring what its cars do. The leader counts a
 * win. Ties go to points, then wins, then the order before the race. `null` for a race without
 * standings.
 */
export function projectedStandings(
  race: ReplayRace,
  scorers: readonly string[],
): StandingsTables | null {
  const lines = before(race);
  if (lines === null) return null;

  const teamOf = new Map(race.drivers.map((driver) => [driver.id, driver.teamId]));
  const driverGain = scorerPoints(scorers);
  const leader = scorers[0];

  return {
    drivers: projectStandings(lines.drivers, driverGain, leader),
    teams: projectStandings(
      lines.teams,
      teamPoints(driverGain, (id) => teamOf.get(id)),
      leader === undefined ? undefined : teamOf.get(leader),
    ),
  };
}

/**
 * The official standings after the round, as published, with what each line gained in the race
 * and its change of place against the standings before it. `null` for a race without standings.
 */
export function officialStandings(race: ReplayRace): StandingsTables | null {
  const lines = before(race);
  const { standings } = race;
  if (lines === null || standings === null) return null;

  const official = (
    table: BeforeLine[],
    after: readonly { id: string; position: number; points: number }[],
  ): StandingsEntry[] => {
    const was = new Map(table.map((line) => [line.id, line]));
    return after.flatMap(({ id, position, points }) => {
      const line = was.get(id);
      if (!line) return [];
      return [
        {
          id,
          name: line.name,
          color: line.color,
          position,
          points,
          gained: points - line.points,
          positionChange: line.position - position,
        },
      ];
    });
  };

  return {
    drivers: official(
      lines.drivers,
      standings.drivers.map((line) => ({ ...line, id: line.driverId })),
    ),
    teams: official(
      lines.teams,
      standings.teams.map((line) => ({ ...line, id: line.constructorId })),
    ),
  };
}

/**
 * The standings to show at race time: projected while the race runs, official once the chequered
 * flag is out. `null` for a race without standings.
 */
export function standingsAt(
  race: ReplayRace,
  scorers: readonly string[],
  finished: boolean,
): StandingsTables | null {
  return finished ? officialStandings(race) : projectedStandings(race, scorers);
}
