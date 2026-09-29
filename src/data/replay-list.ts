/**
 * The races `bun run replays:build` fetches. Curated and small on purpose: the page loads one
 * static JSON per race, and every entry here is a request budget against a public API.
 */
export type ReplaySelection = { season: number; round: number };

export const REPLAY_LIST: readonly ReplaySelection[] = [
  { season: 2021, round: 22 },
  { season: 2024, round: 21 },
  { season: 2023, round: 21 },
  { season: 2025, round: 1 },
  { season: 2026, round: 14 },
  { season: 2026, round: 15 },
];
