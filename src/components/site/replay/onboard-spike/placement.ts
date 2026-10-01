/**
 * SPIKE (issue #9), throwaway. Where every running car is in the Onboard view at race time, in
 * metres. It reads `carLapsAt` as it is and maps each car's constant-speed lap fraction through
 * the spike's speed profile; a car in the pit lane drives it at constant speed.
 */
import type { ReplayRace } from '../../../../data/replay-schema';
import { type PitLaneShape, carLapsAt } from '../../../../data/replay-timing';
import { type SpeedProfile, distanceAt } from './speed-profile';
import { type TrackModel, type TrackPoint, pointAt } from './track';

export type PlacedCar = TrackPoint & {
  /** Laps completed plus the lap fraction, as `carLapsAt` has it: the leader has the most. */
  distance: number;
};

const timedStop = (row: { inPit: boolean; pitDurationMs: number | null } | undefined) =>
  row !== undefined && row.inPit && (row.pitDurationMs ?? 0) > 0;

/** Every running car at `elapsedMs`, by driver id. Retired cars are absent, as on the map. */
export function placeCars(
  race: ReplayRace,
  elapsedMs: number,
  track: TrackModel,
  profile: SpeedProfile,
  pit: PitLaneShape,
): Map<string, PlacedCar> {
  const placed = new Map<string, PlacedCar>();
  const length = track.lap.length;
  for (const [driverId, car] of carLapsAt(race, elapsedMs, pit)) {
    if (car.inPit) {
      const progress = Math.min(Math.max(car.progress, 0), 1);
      placed.set(driverId, {
        ...pointAt(track.pit, progress * track.pit.length),
        distance: car.distance,
      });
      continue;
    }
    const fraction = car.distance - (car.lap - 1);
    // `carLapsAt` stretches an in-lap to reach the pit entry and an out-lap to leave the exit
    // at constant speed; the profile is stretched over the same stretch so nothing jumps.
    const previousLap = race.laps[car.lap - 2];
    const previousRow =
      previousLap?.lap === car.lap - 1
        ? previousLap.rows.find((row) => row.driverId === driverId)
        : undefined;
    let from = 0;
    let to = 1;
    let share = fraction;
    // Past the entry of an in-lap or short of the exit of an out-lap without being in the lane
    // is a stop `carLapsAt` could not draw (a red flag): constant speed there, as it has it.
    let linear = false;
    if (timedStop(car.row)) {
      to = pit.entry;
      share = fraction / pit.entry;
      linear = fraction > pit.entry;
    } else if (timedStop(previousRow)) {
      from = pit.exit;
      share = (fraction - pit.exit) / (1 - pit.exit);
      linear = fraction < pit.exit;
    }
    const metres = linear
      ? fraction * length
      : distanceAt(profile, car.lap === 1, from * length, to * length, share);
    placed.set(driverId, { ...pointAt(track.lap, metres), distance: car.distance });
  }
  return placed;
}

/** The car the Onboard view rides with: the followed driver while running, else the leader. */
export function ridingWith(
  cars: ReadonlyMap<string, { distance: number }>,
  followedId: string | undefined,
): string | undefined {
  if (followedId !== undefined && cars.has(followedId)) return followedId;
  let leader: string | undefined;
  let best = -Infinity;
  for (const [driverId, car] of cars) {
    if (car.distance > best) {
      best = car.distance;
      leader = driverId;
    }
  }
  return leader;
}
