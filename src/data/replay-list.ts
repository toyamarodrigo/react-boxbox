/**
 * The races `bun run replays:build` fetches: the current season in full, and a hand-picked
 * handful of classic races from earlier ones. The page loads one static JSON per race, and every
 * entry here is a request budget against a public API.
 */
export type ReplaySelection = { season: number; round: number };

/** Seasons offered in full: every round with a published result. */
export const REPLAY_SEASONS: readonly number[] = [2026];

/** Classic races, chosen by hand. Rounds checked against jolpica. */
export const CLASSIC_RACES: readonly ReplaySelection[] = [
  { season: 2021, round: 22 },
  { season: 2023, round: 13 },
  { season: 2023, round: 21 },
  { season: 2024, round: 11 },
  { season: 2024, round: 21 },
  { season: 2025, round: 1 },
  { season: 2025, round: 12 },
  { season: 2025, round: 24 },
];

export const raceId = ({ season, round }: ReplaySelection) => `${season}-${round}`;

/**
 * The rounds of a season that have a result, from the rows of `/{season}/results/1.json`: the
 * winner's row only exists once a race has been classified. In round order.
 */
export function seasonSelections(
  season: number,
  races: readonly { round?: string }[],
): ReplaySelection[] {
  return races
    .map((race) => Number.parseInt(race.round ?? '', 10))
    .filter((round) => Number.isInteger(round) && round > 0)
    .sort((a, b) => a - b)
    .map((round) => ({ season, round }));
}

/** The selections with no `<id>.json` among `files` yet, so a rerun only fetches what is new. */
export function notOnDisk(
  selections: readonly ReplaySelection[],
  files: readonly string[],
): ReplaySelection[] {
  const written = new Set(files);
  return selections.filter((selection) => !written.has(`${raceId(selection)}.json`));
}
