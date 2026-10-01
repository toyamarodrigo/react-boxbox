import type { TyreCompound } from '@/registry/boxbox/lib/types';
import type { ReplayRace } from './replay-schema';
import type { SpeedProfile } from './speed-profile';
import { type PitLaneShape, type ReplayPitStop, carLapsAt, stintAt } from './replay-timing';

/** How long the card stays up after the car leaves the lane, in ms of race time. */
export const PIT_STOP_CARD_HOLD_MS = 8000;

/** What the Pit Stop Card shows for one stop at one moment of the race. */
export type ReplayPitStopCard = {
  /** One per stop, so a new stop remounts the card and it wipes in again. */
  key: string;
  driverId: string;
  stop: number;
  /** Seconds in the lane so far; the stop's whole lane time from the exit on. */
  laneTime: number;
  compoundOff?: TyreCompound;
  compoundOn?: TyreCompound;
  positionIn: number;
  /** Absent while the car is still in the lane. */
  positionOut?: number;
};

/** The car's place in the running order at a moment, the way the tower counts it. */
function positionAt(
  race: ReplayRace,
  driverId: string,
  atMs: number,
  pit: PitLaneShape,
  profile: SpeedProfile | undefined,
): number | undefined {
  const order = [...carLapsAt(race, atMs, pit, profile)].sort(
    (a, b) => b[1].distance - a[1].distance,
  );
  const index = order.findIndex(([id]) => id === driverId);
  return index === -1 ? undefined : index + 1;
}

/**
 * The followed driver's Pit Stop Card at `elapsedMs`: during the stop's pit window and for
 * `PIT_STOP_CARD_HOLD_MS` of race time after the exit, otherwise `null`.
 *
 * The windows are the drawable stops of `replayPitStops`, so the card and the tower's `IN PIT`
 * agree on when the car is in the lane; a red-flag wait is not among them, so it has `IN PIT` and
 * no card. The position in is the car's place as it enters, the
 * position out its place at the exit, held from then on rather than followed. A stop is on the
 * last lap of one stint, so the compound off is that stint's and the compound on the next one's;
 * either unknown leaves both out. The stop number is the stop's among the car's drawable stops,
 * so a hidden red-flag wait is not counted. Places are read with the circuit's speed `profile`,
 * as the tower reads them.
 */
export function pitStopCardAt(
  race: ReplayRace,
  driverId: string,
  elapsedMs: number,
  stops: readonly ReplayPitStop[],
  pit: PitLaneShape,
  profile?: SpeedProfile,
): ReplayPitStopCard | null {
  // The stops are in time order, so the car's latest one begun is the last that has.
  const own = stops.filter((stop) => stop.driverId === driverId);
  const begun = own.filter((stop) => elapsedMs >= stop.atMs).length;
  const stop = own[begun - 1];
  if (!stop) return null;
  const outAt = stop.atMs + stop.durationMs;
  if (elapsedMs >= outAt + PIT_STOP_CARD_HOLD_MS) return null;

  const positionIn = positionAt(race, driverId, stop.atMs, pit, profile);
  if (positionIn === undefined) return null;
  const out = elapsedMs >= outAt;

  const stints = race.stints.find((car) => car.driverId === driverId)?.stints;
  const off = stintAt(stints, stop.lap)?.compound ?? undefined;
  const on = stintAt(stints, stop.lap + 1)?.compound ?? undefined;
  const tyres = off !== undefined && on !== undefined;

  return {
    key: `${driverId}-${stop.lap}`,
    driverId,
    stop: stop.stop,
    laneTime: (out ? stop.durationMs : elapsedMs - stop.atMs) / 1000,
    compoundOff: tyres ? off : undefined,
    compoundOn: tyres ? on : undefined,
    positionIn,
    positionOut: out ? positionAt(race, driverId, outAt, pit, profile) : undefined,
  };
}
