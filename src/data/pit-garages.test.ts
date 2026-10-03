import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GARAGE_STRETCH, boxShare, garageOrder, garageShares } from './pit-garages';
import { generatedReplayFiles, readJson } from './replay-fixtures';
import { type ReplayRace, replayRaceSchema } from './replay-schema';
import { standingsBefore } from './replay-standings';

const load = (fileName: string) => {
  const file = generatedReplayFiles().find((name) => path.basename(name) === fileName);
  return file ? replayRaceSchema.parse(readJson(file)) : null;
};

const ids = (race: ReplayRace) => race.teams.map((team) => team.id);
const sorted = (list: readonly string[]) => [...list].sort((a, b) => (a < b ? -1 : 1));

const spa = load('2026-10.json');
const melbourne = load('2026-1.json');

describe('garageOrder', () => {
  it.skipIf(spa === null)('follows the constructors’ standings before the race', () => {
    const race = spa!;
    const before = standingsBefore(race)!.teams;
    const scored = before.filter((line) => line.points > 0).map((line) => line.id);
    expect(scored.length).toBeGreaterThan(2);
    const order = garageOrder(race);
    expect(order.slice(0, scored.length)).toEqual(scored);
    // The teams yet to score follow, by constructor id.
    const rest = order.slice(scored.length);
    expect(rest).toEqual(sorted(rest));
    expect(sorted(order)).toEqual(sorted(ids(race)));
  });

  it.skipIf(spa === null)('falls back to constructor id order without standings', () => {
    const race = { ...spa!, standings: null };
    expect(garageOrder(race)).toEqual(sorted(ids(race)));
  });

  it.skipIf(melbourne === null)('orders the first round by id: nobody has scored yet', () => {
    const race = melbourne!;
    expect(standingsBefore(race)!.teams.every((line) => line.points === 0)).toBe(true);
    expect(garageOrder(race)).toEqual(sorted(ids(race)));
  });
});

describe('garageShares', () => {
  it('spreads every race’s boxes over the middle stretch, in garage order', () => {
    const races = generatedReplayFiles().map((file) => replayRaceSchema.parse(readJson(file)));
    for (const race of races) {
      const shares = garageOrder(race).map((teamId) => garageShares(race).get(teamId)!);
      expect(shares.length, race.id).toBe(race.teams.length);
      for (const [index, share] of shares.entries()) {
        expect(share).toBeGreaterThan(GARAGE_STRETCH.from);
        expect(share).toBeLessThan(GARAGE_STRETCH.to);
        if (index > 0) expect(share).toBeGreaterThan(shares[index - 1]!);
      }
    }
  });

  it.skipIf(spa === null)('gives a car its team’s box, and the middle to an unknown car', () => {
    const race = spa!;
    const gasly = race.drivers.find((driver) => driver.id === 'gasly')!;
    expect(boxShare(race, 'gasly')).toBe(garageShares(race).get(gasly.teamId));
    expect(boxShare(race, 'nobody')).toBe((GARAGE_STRETCH.from + GARAGE_STRETCH.to) / 2);
  });
});
