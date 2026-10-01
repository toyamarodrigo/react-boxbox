import type { ReplayRace } from './replay-schema';
import { standingsBefore } from './replay-standings';

/**
 * Where each team's garage, and so its box, is along a replay race's pit lane. Pure and cached
 * per race object, like the other replay helpers: `carLapsAt` stops a car at its team's box, and
 * the Onboard view draws the garages at the same shares, so the two never disagree (ADR 0005).
 *
 * Real pit lanes give out garages by the previous championship. The dataset has no such order,
 * so this takes the constructors' standings before the race as the approximation.
 */

/**
 * The stretch of the pit lane the garages fill, as shares of it from 0 at the entry to 1 at the
 * exit. Kept off both ends, so a box never sits at the entry or the exit.
 */
export const GARAGE_STRETCH = { from: 0.2, to: 0.8 } as const;

/** The box share for a car whose team has no garage: the middle of the lane. */
const MIDDLE_BOX = (GARAGE_STRETCH.from + GARAGE_STRETCH.to) / 2;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The race's teams in garage order, nearest the pit entry first: the teams that have scored
 * before the race, in the order of the constructors' standings then; after them every team yet
 * to score, and every team of a race without standings, by constructor id. The first round has
 * nobody on points, so its order is by id too, rather than borrowed from its own result.
 */
export function garageOrder(race: ReplayRace): string[] {
  const teamIds = new Set(race.teams.map((team) => team.id));
  const scored = (standingsBefore(race)?.teams ?? [])
    .filter((line) => line.points > 0 && teamIds.has(line.id))
    .map((line) => line.id);
  const placed = new Set(scored);
  const rest = [...teamIds].filter((id) => !placed.has(id)).sort(byId);
  return [...scored, ...rest];
}

const SHARES = new WeakMap<ReplayRace, ReadonlyMap<string, number>>();

/**
 * Each team's box as a share of the pit lane, from 0 at the entry to 1 at the exit: the teams in
 * `garageOrder`, each in the middle of an equal slot of `GARAGE_STRETCH`.
 */
export function garageShares(race: ReplayRace): ReadonlyMap<string, number> {
  const cached = SHARES.get(race);
  if (cached) return cached;
  const order = garageOrder(race);
  const slot = (GARAGE_STRETCH.to - GARAGE_STRETCH.from) / order.length;
  const shares = new Map(
    order.map((teamId, index) => [teamId, GARAGE_STRETCH.from + slot * (index + 0.5)]),
  );
  SHARES.set(race, shares);
  return shares;
}

/** Where along the pit lane `driverId` stops: its team's box, or the middle without one. */
export function boxShare(race: ReplayRace, driverId: string): number {
  const teamId = race.drivers.find((driver) => driver.id === driverId)?.teamId;
  return (teamId === undefined ? undefined : garageShares(race).get(teamId)) ?? MIDDLE_BOX;
}
