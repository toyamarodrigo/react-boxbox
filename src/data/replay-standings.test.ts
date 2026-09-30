import { describe, expect, it } from 'vitest';
import type { StandingsEntry } from '@/registry/boxbox/ui/standings';
import { testReplayRace } from './replay-fixtures';
import type { ReplayRace } from './replay-schema';
import {
  RACE_POINTS,
  officialStandings,
  pointScorers,
  projectedStandings,
  racePoints,
  standingsAt,
  standingsBefore,
} from './replay-standings';

const race = testReplayRace();

/** A table as `[name, position, points, gained, positionChange]`, easy to read in an assertion. */
const lines = (entries: readonly StandingsEntry[] | undefined) =>
  (entries ?? []).map((entry) => [
    entry.name,
    entry.position,
    entry.points,
    entry.gained,
    entry.positionChange,
  ]);

/** The test race with some drivers' standings after the round replaced. */
function withDrivers(overrides: Record<string, { points?: number; wins?: number }>): ReplayRace {
  const standings = race.standings!;
  return {
    ...race,
    standings: {
      ...standings,
      drivers: standings.drivers.map((line) => ({ ...line, ...overrides[line.driverId] })),
    },
  };
}

describe('racePoints', () => {
  it('pays the top ten and nothing below', () => {
    expect(RACE_POINTS.map((_, index) => racePoints(index + 1))).toEqual([
      25, 18, 15, 12, 10, 8, 6, 4, 2, 1,
    ]);
    expect(racePoints(11)).toBe(0);
    expect(racePoints(0)).toBe(0);
  });
});

describe('pointScorers', () => {
  it('lists the running cars in race order and leaves a retired car out', () => {
    expect(
      pointScorers([
        { driverId: 'charlie', position: 2 },
        { driverId: 'delta', position: 3, finishStatus: 'dnf' },
        { driverId: 'alpha', position: 1, finishStatus: 'finished' },
        { driverId: 'bravo', position: 4 },
      ]),
    ).toEqual(['alpha', 'charlie', 'bravo']);
  });

  it('stops at the tenth place', () => {
    const rows = Array.from({ length: 14 }, (_, index) => ({
      driverId: `car-${index + 1}`,
      position: index + 1,
    }));
    expect(pointScorers(rows)).toHaveLength(10);
    expect(pointScorers(rows).at(-1)).toBe('car-10');
  });
});

describe('standingsBefore', () => {
  it('is the standings after the round less the points of this race', () => {
    const tables = standingsBefore(race);
    expect(lines(tables?.drivers)).toEqual([
      ['ALP', 1, 82, 0, 0],
      ['BRA', 2, 65, 0, 0],
      // Echo is not in this race and keeps what it had.
      ['ECH', 3, 30, 0, 0],
      ['CHA', 4, 25, 0, 0],
      ['DEL', 5, 20, 0, 0],
    ]);
    expect(lines(tables?.teams)).toEqual([
      ['Blue Team', 1, 115, 0, 0],
      ['Red Team', 2, 107, 0, 0],
    ]);
  });

  it('counts a sprint on the same weekend as before the race', () => {
    // Alpha scored 8 in the sprint: the standings after the round carry them, the race results do not.
    const sprint = withDrivers({ alpha: { points: 108 } });
    expect(standingsBefore(sprint)?.drivers[0]).toMatchObject({ name: 'ALP', points: 90 });
    // At the flag the race gained its own points, not the sprint's.
    expect(officialStandings(sprint)?.drivers[0]).toMatchObject({ points: 108, gained: 18 });
  });

  it('takes the colour from the team the driver raced for, else the one it last drove for', () => {
    const tables = standingsBefore(race);
    const colour = (name: string) => tables?.drivers.find((entry) => entry.name === name)?.color;
    expect(colour('ALP')).toBe('#ff0000');
    expect(colour('ECH')).toBe('#0000ff');
  });
});

describe('projectedStandings', () => {
  it('adds the points each place is worth now, teams scoring what their cars do', () => {
    const tables = projectedStandings(race, ['charlie', 'delta', 'alpha', 'bravo']);
    expect(lines(tables?.drivers)).toEqual([
      ['ALP', 1, 97, 15, 0],
      ['BRA', 2, 77, 12, 0],
      ['CHA', 3, 50, 25, 1],
      ['DEL', 4, 38, 18, 1],
      ['ECH', 5, 30, 0, -2],
    ]);
    expect(lines(tables?.teams)).toEqual([
      ['Red Team', 1, 147, 40, 1],
      ['Blue Team', 2, 145, 30, -1],
    ]);
  });

  it('is the standings before the race while nobody holds a place', () => {
    expect(projectedStandings(race, [])).toEqual(standingsBefore(race));
  });

  it('gives a retired car nothing', () => {
    const scorers = pointScorers([
      { driverId: 'bravo', position: 1 },
      { driverId: 'alpha', position: 2 },
      { driverId: 'delta', position: 3, finishStatus: 'dnf' },
    ]);
    const delta = projectedStandings(race, scorers)?.drivers.find((entry) => entry.id === 'delta');
    expect(delta).toMatchObject({ points: 20, gained: 0 });
  });

  it('breaks a tie on points by wins, the leader counting one', () => {
    // Echo on 45 before the race, delta 20 + 25 for the lead: level, and delta has the win.
    const tables = projectedStandings(withDrivers({ echo: { points: 45 } }), ['delta']);
    const order = tables?.drivers.map((entry) => entry.name);
    expect(order?.indexOf('DEL')).toBeLessThan(order?.indexOf('ECH') ?? -1);
  });

  it('breaks a tie on points and wins by the order before the race', () => {
    // Delta 20 + 10 for fifth draws level with echo on 30, neither with a win: echo was ahead.
    const tables = projectedStandings(race, ['alpha', 'bravo', 'charlie', 'nobody', 'delta']);
    expect(lines(tables?.drivers).slice(3)).toEqual([
      ['ECH', 4, 30, 0, -1],
      ['DEL', 5, 30, 10, 0],
    ]);
  });
});

describe('officialStandings', () => {
  it('shows the published standings with what the race gained and the places moved', () => {
    const tables = officialStandings(race);
    expect(lines(tables?.drivers)).toEqual([
      ['ALP', 1, 100, 18, 0],
      ['BRA', 2, 90, 25, 0],
      ['CHA', 3, 40, 15, 1],
      ['ECH', 4, 30, 0, -1],
      ['DEL', 5, 20, 0, 0],
    ]);
    // Level on 140: the published order has red ahead on wins.
    expect(lines(tables?.teams)).toEqual([
      ['Red Team', 1, 140, 33, 1],
      ['Blue Team', 2, 140, 25, -1],
    ]);
  });
});

describe('standingsAt', () => {
  it('projects while the race runs and switches to the official standings at the flag', () => {
    const scorers = ['charlie', 'delta', 'alpha', 'bravo'];
    expect(standingsAt(race, scorers, false)).toEqual(projectedStandings(race, scorers));
    expect(standingsAt(race, scorers, true)).toEqual(officialStandings(race));
  });

  it('has nothing for a race without standings', () => {
    const bare = { ...race, standings: null };
    expect(standingsAt(bare, ['alpha'], false)).toBeNull();
    expect(standingsAt(bare, ['alpha'], true)).toBeNull();
    expect(standingsBefore(bare)).toBeNull();
  });
});
