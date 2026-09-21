import { describe, expect, it } from 'vitest';
import { generatedReplayFiles, readJson } from './replay-fixtures';
import { replayRaceSchema } from './replay-schema';
import { hashHue, hasExplicitColour, teamColour } from './team-colours';

const files = generatedReplayFiles();

describe('hashHue', () => {
  it('is stable for an id', () => expect(hashHue('williams')).toBe(hashHue('williams')));

  it('stays on the colour wheel', () => {
    for (const id of ['a', 'ferrari', 'a-very-long-constructor-id', '', '2026-newcomer']) {
      const hue = hashHue(id);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('separates ids that differ by one character', () =>
    expect(hashHue('teamx')).not.toBe(hashHue('teamy')));
});

describe('teamColour', () => {
  it('returns the mapped colour for a known constructor', () =>
    expect(teamColour(2021, 'ferrari')).toBe('#d40000'));

  it('maps the same constructor differently across seasons where the map says so', () =>
    expect(teamColour(2021, 'mercedes')).not.toBe(teamColour(2024, 'mercedes')));

  it('falls back to a hashed hue for an unmapped constructor', () =>
    expect(teamColour(2024, 'not-a-team')).toBe(`oklch(0.65 0.15 ${hashHue('not-a-team')})`));

  it('falls back for an unmapped season', () =>
    expect(teamColour(1998, 'ferrari')).toBe(`oklch(0.65 0.15 ${hashHue('ferrari')})`));

  it('is deterministic across calls', () =>
    expect(teamColour(2030, 'brand-new')).toBe(teamColour(2030, 'brand-new')));
});

describe('curated races', () => {
  if (files.length === 0) {
    it.skip('are not generated yet, so the colour coverage check is skipped', () => {});
    return;
  }

  it.each(files)('%s has an explicit colour for every constructor', (file) => {
    const race = replayRaceSchema.parse(readJson(file));
    const unmapped = race.teams
      .map((team) => team.id)
      .filter((id) => !hasExplicitColour(race.season, id));
    expect(unmapped).toEqual([]);
  });
});
