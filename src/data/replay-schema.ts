import { z } from 'zod';

/**
 * Schemas for the build-time replay dataset in `public/data/replays/`.
 *
 * `replayDriverSchema` and `replayTeamSchema` are structurally the boxbox `Driver` and `Team`
 * types, so a replay feeds the registry components without a mapping layer. They are looser than
 * `src/data/schema.ts`: real grids are not always twenty cars in ten equal teams, codes are not
 * always three letters in the older seasons, and a team colour may be the hashed `oklch()`
 * fallback rather than a hex value.
 */
export const replayDriverSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  number: z.number().int().min(0).max(999),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  teamId: z.string().min(1),
});

export const replayTeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
});

export const replayLapRowSchema = z.object({
  driverId: z.string().min(1),
  position: z.number().int().min(1),
  lapTimeMs: z.number().int().min(0).nullable(),
  cumulativeMs: z.number().int().min(0).nullable(),
  gapToLeaderMs: z.number().int().min(0).nullable(),
  intervalMs: z.number().int().min(0).nullable(),
  inPit: z.boolean(),
  /** Time from pit entry to pit exit on this lap's stop, when the source has it. */
  pitDurationMs: z.number().int().min(0).nullable().default(null),
  /** Which stop of the race this was for the car: 1 for the first. */
  pitStop: z.number().int().min(1).nullable().default(null),
  overtake: z.boolean(),
  lapsBehind: z.number().int().min(0),
});

export const replayLapSchema = z.object({
  lap: z.number().int().min(1),
  rows: z.array(replayLapRowSchema).min(1),
});

export const finishStatusSchema = z.enum(['finished', 'dnf', 'dsq', 'dns']);

export const replayResultSchema = z.object({
  driverId: z.string().min(1),
  position: z.number().int().min(1).nullable(),
  positionText: z.string().min(1),
  /** The car's grid slot. Zero is a pit-lane start, which has no slot; `null` when unknown. */
  grid: z.number().int().min(0).nullable().default(null),
  points: z.number().min(0),
  laps: z.number().int().min(0),
  status: z.string().min(1),
  finishStatus: finishStatusSchema,
  timeMs: z.number().int().min(0).nullable(),
  gapToWinnerMs: z.number().int().min(0).nullable(),
  lapsBehind: z.number().int().min(0),
});

export const replaySourceSchema = z.object({
  provider: z.literal('jolpica-f1'),
  fetchedAt: z.iso.datetime(),
  url: z.url(),
});

export const replayRaceSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{1,2}$/),
  season: z.number().int().min(1950),
  round: z.number().int().min(1),
  name: z.string().min(1),
  circuit: z.string().min(1),
  date: z.iso.date(),
  totalLaps: z.number().int().min(1),
  source: replaySourceSchema,
  drivers: z.array(replayDriverSchema).min(1),
  teams: z.array(replayTeamSchema).min(1),
  laps: z.array(replayLapSchema).min(1),
  results: z.array(replayResultSchema).min(1),
});

export const replayIndexEntrySchema = z.object({
  id: z.string().regex(/^\d{4}-\d{1,2}$/),
  season: z.number().int().min(1950),
  round: z.number().int().min(1),
  name: z.string().min(1),
  circuit: z.string().min(1),
  date: z.iso.date(),
  totalLaps: z.number().int().min(1),
  driverCount: z.number().int().min(1),
  winnerCode: z.string().min(1),
});

export const replayIndexSchema = z.object({
  generatedAt: z.iso.datetime(),
  races: z.array(replayIndexEntrySchema),
});

export type ReplayDriver = z.infer<typeof replayDriverSchema>;
export type ReplayTeam = z.infer<typeof replayTeamSchema>;
export type ReplayLapRow = z.infer<typeof replayLapRowSchema>;
export type ReplayLap = z.infer<typeof replayLapSchema>;
export type ReplayFinishStatus = z.infer<typeof finishStatusSchema>;
export type ReplayResult = z.infer<typeof replayResultSchema>;
export type ReplaySource = z.infer<typeof replaySourceSchema>;
export type ReplayRace = z.infer<typeof replayRaceSchema>;
export type ReplayIndexEntry = z.infer<typeof replayIndexEntrySchema>;
export type ReplayIndex = z.infer<typeof replayIndexSchema>;
