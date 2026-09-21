/**
 * Colours for the constructors that appear in the curated replays.
 *
 * These are approximate identifying colours, chosen by eye and written as plain hex. They are
 * not liveries, logos or official brand values, and nothing here is reused by the registry
 * components, which stay on the invented grid in `src/data/grid.ts`.
 *
 * The map is per season because constructors change colour between seasons, and because a
 * constructor id can be reused by a renamed team. A constructor that is missing from the map
 * falls back to a hue hashed from its id, so a new season still renders distinguishable rows.
 */
const SEASON_COLOURS: Record<number, Record<string, string>> = {
  2021: {
    alfa: '#8c0b0b',
    alphatauri: '#2b4562',
    alpine: '#1a6ec4',
    aston_martin: '#0b5c4a',
    ferrari: '#d40000',
    haas: '#9aa0a6',
    mclaren: '#ef7e19',
    mercedes: '#00a19c',
    red_bull: '#16306f',
    williams: '#3f9fe0',
  },
  2023: {
    alfa: '#8c0b0b',
    alphatauri: '#3d5a80',
    alpine: '#1a6ec4',
    aston_martin: '#0b5c4a',
    ferrari: '#d40000',
    haas: '#9aa0a6',
    mclaren: '#ef7e19',
    mercedes: '#3fb8af',
    red_bull: '#16306f',
    williams: '#3f9fe0',
  },
  2024: {
    alpine: '#1a6ec4',
    aston_martin: '#0b5c4a',
    ferrari: '#d40000',
    haas: '#9aa0a6',
    mclaren: '#ef7e19',
    mercedes: '#3fb8af',
    rb: '#6f7fd8',
    red_bull: '#16306f',
    sauber: '#39b54a',
    williams: '#3f9fe0',
  },
  2025: {
    alpine: '#1a6ec4',
    aston_martin: '#0b5c4a',
    ferrari: '#d40000',
    haas: '#9aa0a6',
    mclaren: '#ef7e19',
    mercedes: '#3fb8af',
    rb: '#6f7fd8',
    red_bull: '#16306f',
    sauber: '#39b54a',
    williams: '#3f9fe0',
  },
  2026: {
    alpine: '#1a6ec4',
    aston_martin: '#0b5c4a',
    audi: '#b32639',
    cadillac: '#8c7a3f',
    ferrari: '#d40000',
    haas: '#9aa0a6',
    mclaren: '#ef7e19',
    mercedes: '#3fb8af',
    rb: '#6f7fd8',
    red_bull: '#16306f',
    williams: '#3f9fe0',
  },
};

/**
 * FNV-1a over the id, folded onto the colour wheel. Deterministic and stable across runs, so a
 * rebuilt dataset does not reshuffle the colours of the teams it could not name.
 */
export function hashHue(constructorId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < constructorId.length; index += 1) {
    hash ^= constructorId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/** The colour for a constructor in a season, or a hashed fallback when it is not mapped. */
export function teamColour(season: number, constructorId: string): string {
  const explicit = SEASON_COLOURS[season]?.[constructorId];
  if (explicit !== undefined) return explicit;
  return `oklch(0.65 0.15 ${hashHue(constructorId)})`;
}

/** Exposed so the tests can assert that every curated race is fully mapped. */
export function hasExplicitColour(season: number, constructorId: string): boolean {
  return SEASON_COLOURS[season]?.[constructorId] !== undefined;
}
