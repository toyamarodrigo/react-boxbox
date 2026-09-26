import type { ReplayIndexEntry } from './replay-schema';

/** Newest first, which is also the default selection on the Replay page. */
export function byDateDescending(races: readonly ReplayIndexEntry[]): ReplayIndexEntry[] {
  return [...races].sort((a, b) => b.date.localeCompare(a.date));
}

/** The race a visitor gets when they have not asked for one. */
export function latestRace(races: readonly ReplayIndexEntry[]): ReplayIndexEntry | undefined {
  return byDateDescending(races)[0];
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
