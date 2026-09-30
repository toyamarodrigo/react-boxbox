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
  /**
   * The lap's three sector times in whole milliseconds, from OpenF1. A sector the source has no
   * usable figure for is `null`; a lap it has no row for at all stays `[null, null, null]`.
   */
  sectorMs: z
    .tuple([
      z.number().int().min(0).nullable(),
      z.number().int().min(0).nullable(),
      z.number().int().min(0).nullable(),
    ])
    .default([null, null, null]),
  /** The car's speed-trap reading on this lap, in km/h. */
  speedTrapKph: z.number().int().min(0).nullable().default(null),
});

export const replayLapSchema = z.object({
  lap: z.number().int().min(1),
  rows: z.array(replayLapRowSchema).min(1),
});

export const finishStatusSchema = z.enum(['finished', 'dnf', 'dsq', 'dns']);

/** The boxbox `TyreCompound` union: soft, medium, hard, intermediate, wet. */
export const tyreCompoundSchema = z.enum(['S', 'M', 'H', 'I', 'W']);

/**
 * One set of tyres, from the start or a pit stop to the next stop or the finish. The laps are
 * inclusive. `compound` is `null` whenever the compound source has nothing for that stint: the
 * cuts come from the pit stops, which are complete, and the compound from a second source that
 * is not.
 */
export const replayStintSchema = z
  .object({
    fromLap: z.number().int().min(1),
    toLap: z.number().int().min(1),
    compound: tyreCompoundSchema.nullable(),
  })
  .refine((stint) => stint.toLap >= stint.fromLap, {
    message: 'A stint ends on or after the lap it starts on',
  });

export const replayDriverStintsSchema = z.object({
  driverId: z.string().min(1),
  stints: z.array(replayStintSchema),
});

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

/**
 * One race-control message, placed on the replay clock.
 *
 * The source publishes a wall-clock `date`, which is no use to a page whose clock starts at zero,
 * so the build converts it to `atMs`, milliseconds since the start of the race. A message whose
 * time cannot be resolved is dropped at build time rather than guessed at here.
 *
 * `flag`, `category` and `scope` are kept as the source spells them — `GREEN`, `DOUBLE YELLOW`,
 * `SafetyCar`, `Sector` — because this is a record of what race control said, and reading them is
 * the helpers' job, not the dataset's. `sector` is a **marshalling** sector, of which a circuit has
 * twenty-odd, not one of the three timing sectors.
 */
export const replayRaceControlSchema = z.object({
  /** Milliseconds since the start of the race. */
  atMs: z.number().int().min(0),
  /** The lap the message was issued on, when the source says. */
  lap: z.number().int().min(0).nullable(),
  flag: z.string().min(1).nullable(),
  category: z.string().min(1),
  scope: z.string().min(1).nullable(),
  sector: z.number().int().min(1).nullable(),
  /** This project's own driver id when the message names a car; `null` when it names none. */
  driverId: z.string().min(1).nullable(),
  message: z.string().min(1),
});

/**
 * One driver's line in the championship after the race's round, as jolpica-f1 publishes it.
 * `code` and `constructorId` are carried so a driver who is in the standings but not in this
 * race still has a name and a colour to show; the constructor is the driver's latest one.
 */
export const replayDriverStandingSchema = z.object({
  driverId: z.string().min(1),
  code: z.string().min(1),
  constructorId: z.string().min(1),
  position: z.number().int().min(1),
  points: z.number().min(0),
  wins: z.number().int().min(0),
});

/** One team's line in the championship after the race's round. */
export const replayTeamStandingSchema = z.object({
  constructorId: z.string().min(1),
  name: z.string().min(1),
  position: z.number().int().min(1),
  points: z.number().min(0),
  wins: z.number().int().min(0),
});

/**
 * The drivers' and the teams' standings **after** the race's round, sprint included. The
 * standings before the race are derived from these and the race's own results, not stored.
 */
export const replayStandingsSchema = z.object({
  drivers: z.array(replayDriverStandingSchema),
  teams: z.array(replayTeamStandingSchema),
});

/** Where a jolpica-f1 block fetched after the race itself came from. */
export const replayJolpicaSourceSchema = z.object({
  provider: z.literal('jolpica-f1'),
  fetchedAt: z.iso.datetime(),
  url: z.url(),
});

/**
 * Where one OpenF1-sourced field came from. Absent when a race has none: each block is filled
 * on its own, so a race can carry compounds without timing and the other way round.
 */
export const replayOpenF1SourceSchema = z.object({
  provider: z.literal('openf1'),
  fetchedAt: z.iso.datetime(),
  url: z.url(),
});

/** Kept under its original name for the compound block's callers. */
export const replayCompoundSourceSchema = replayOpenF1SourceSchema;

export const replaySourceSchema = z.object({
  provider: z.literal('jolpica-f1'),
  fetchedAt: z.iso.datetime(),
  url: z.url(),
  compounds: replayOpenF1SourceSchema.optional(),
  /** Where the sector times and speed-trap readings came from. */
  timing: replayOpenF1SourceSchema.optional(),
  /** Where the race-control messages came from. */
  raceControl: replayOpenF1SourceSchema.optional(),
  /** Where the standings came from: the drivers' table, with the teams' table beside it. */
  standings: replayJolpicaSourceSchema.optional(),
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
  /** One entry per car that ran a lap. Defaults to none, so a race built before this parses. */
  stints: z.array(replayDriverStintsSchema).default([]),
  /** Race control's own messages, oldest first. Empty for a race the source does not cover. */
  raceControl: z.array(replayRaceControlSchema).default([]),
  /** The standings after this round. `null` for a race built before them, or with none published. */
  standings: replayStandingsSchema.nullable().default(null),
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
export type ReplayTyreCompound = z.infer<typeof tyreCompoundSchema>;
export type ReplayStint = z.infer<typeof replayStintSchema>;
export type ReplayDriverStints = z.infer<typeof replayDriverStintsSchema>;
export type ReplayResult = z.infer<typeof replayResultSchema>;
export type ReplayRaceControl = z.infer<typeof replayRaceControlSchema>;
export type ReplayDriverStanding = z.infer<typeof replayDriverStandingSchema>;
export type ReplayTeamStanding = z.infer<typeof replayTeamStandingSchema>;
export type ReplayStandings = z.infer<typeof replayStandingsSchema>;
export type ReplaySource = z.infer<typeof replaySourceSchema>;
export type ReplayOpenF1Source = z.infer<typeof replayOpenF1SourceSchema>;
export type ReplayCompoundSource = ReplayOpenF1Source;
export type ReplayRace = z.infer<typeof replayRaceSchema>;
export type ReplayIndexEntry = z.infer<typeof replayIndexEntrySchema>;
export type ReplayIndex = z.infer<typeof replayIndexSchema>;
