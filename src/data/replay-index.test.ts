import { describe, expect, it } from 'vitest';
import { raceGroups, raceLabel } from './replay-index';
import type { ReplayIndexEntry } from './replay-schema';

const entry = (season: number, round: number, date: string, name: string): ReplayIndexEntry => ({
  id: `${season}-${round}`,
  season,
  round,
  name,
  circuit: 'Test Circuit',
  date,
  totalLaps: 50,
  driverCount: 20,
  winnerCode: 'TST',
});

const races = [
  entry(2021, 22, '2021-12-12', 'Abu Dhabi Grand Prix'),
  entry(2026, 1, '2026-03-08', 'Australian Grand Prix'),
  entry(2025, 24, '2025-12-07', 'Abu Dhabi Grand Prix'),
  entry(2026, 13, '2026-09-06', 'Italian Grand Prix'),
];

describe('raceGroups', () => {
  it('offers the newest season in full and the rest as classics, newest first', () => {
    const groups = raceGroups(races);
    expect(groups.season).toBe(2026);
    expect(groups.current.map((race) => race.id)).toEqual(['2026-13', '2026-1']);
    expect(groups.classics.map((race) => race.id)).toEqual(['2025-24', '2021-22']);
  });

  it('has no classics when the index holds one season', () => {
    const groups = raceGroups(races.filter((race) => race.season === 2026));
    expect(groups.classics).toEqual([]);
    expect(groups.current).toHaveLength(2);
  });

  it('has no season at all for an empty index', () =>
    expect(raceGroups([])).toEqual({ season: undefined, current: [], classics: [] }));
});

describe('raceLabel', () => {
  it('reads the season and the name without "Grand Prix"', () =>
    expect(raceLabel({ season: 2025, name: 'Abu Dhabi Grand Prix' })).toBe('2025 Abu Dhabi'));

  it('leaves a name that is not a grand prix alone', () =>
    expect(raceLabel({ season: 2020, name: 'Sakhir Race' })).toBe('2020 Sakhir Race'));
});
