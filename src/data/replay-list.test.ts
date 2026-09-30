import { describe, expect, it } from 'vitest';
import { CLASSIC_RACES, REPLAY_SEASONS, notOnDisk, raceId, seasonSelections } from './replay-list';

describe('seasonSelections', () => {
  it('takes every round with a winner, in round order', () => {
    expect(seasonSelections(2026, [{ round: '10' }, { round: '2' }, { round: '1' }])).toEqual([
      { season: 2026, round: 1 },
      { season: 2026, round: 2 },
      { season: 2026, round: 10 },
    ]);
  });

  it('drops a row it cannot read a round from', () => {
    expect(seasonSelections(2026, [{ round: '3' }, {}, { round: 'x' }, { round: '0' }])).toEqual([
      { season: 2026, round: 3 },
    ]);
  });

  it('has nothing to take from a season that has not started', () =>
    expect(seasonSelections(2026, [])).toEqual([]));
});

describe('notOnDisk', () => {
  const selections = [
    { season: 2026, round: 14 },
    { season: 2026, round: 15 },
    { season: 2026, round: 16 },
  ];

  it('skips the races whose file is already written', () => {
    expect(notOnDisk(selections, ['2026-14.json', '2026-15.json', 'index.json'])).toEqual([
      { season: 2026, round: 16 },
    ]);
  });

  it('keeps everything on an empty folder', () =>
    expect(notOnDisk(selections, [])).toEqual(selections));

  it('does not read one round as another', () =>
    expect(notOnDisk([{ season: 2026, round: 1 }], ['2026-14.json', '2026-10.json'])).toEqual([
      { season: 2026, round: 1 },
    ]));
});

describe('the curated list', () => {
  it('only names classic races from before the seasons offered in full', () => {
    const firstFull = Math.min(...REPLAY_SEASONS);
    expect(CLASSIC_RACES.filter((race) => race.season >= firstFull)).toEqual([]);
  });

  it('names each classic race once', () => {
    const ids = CLASSIC_RACES.map(raceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
