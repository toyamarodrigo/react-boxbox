import type { ReplayIndexEntry } from './replay-schema';

/** Newest first, which is also the default selection on the Replay page. */
export function byDateDescending(races: readonly ReplayIndexEntry[]): ReplayIndexEntry[] {
  return [...races].sort((a, b) => b.date.localeCompare(a.date));
}

/** The race a visitor gets when they have not asked for one. */
export function latestRace(races: readonly ReplayIndexEntry[]): ReplayIndexEntry | undefined {
  return byDateDescending(races)[0];
}

/**
 * The race picker's two groups, both newest first. The newest season in the index is the one
 * offered in full; every race from an earlier season is a classic race, so the grouping needs
 * nothing the index does not already say.
 */
export function raceGroups(races: readonly ReplayIndexEntry[]): {
  season: number | undefined;
  current: ReplayIndexEntry[];
  classics: ReplayIndexEntry[];
} {
  const sorted = byDateDescending(races);
  // The newest race is always in the newest season.
  const season = sorted[0]?.season;
  return {
    season,
    current: sorted.filter((race) => race.season === season),
    classics: sorted.filter((race) => race.season !== season),
  };
}

/** A race's name without "Grand Prix": `Abu Dhabi`. */
export function raceName(race: Pick<ReplayIndexEntry, 'name'>): string {
  return race.name.replace(/\s*Grand Prix$/, '');
}

/** How a race reads in a list of them: `2025 Abu Dhabi`. */
export function raceLabel(race: Pick<ReplayIndexEntry, 'season' | 'name'>): string {
  return `${race.season} ${raceName(race)}`;
}

/** The stored date is a plain `YYYY-MM-DD`, so it is read as UTC and never drifts a day. */
export function formatRaceDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
}
