import type { TrackSector, TrackStatus } from '@/registry/boxbox/lib/types';
import type { ReplayCircuit } from './circuit-for-race';
import type { ReplayRace } from './replay-schema';
import { type CarLap, carLapsAt, flaggedSectorsAt, trackStatusAt } from './replay-timing';

/**
 * The Onboard view at one race time, with no 3D in it: which car the camera rides with and where
 * the cars on screen are, in metres. The 3D layer only maps this to world positions and draws it,
 * so the race logic stays here, pure and tested, and every place comes from `carLapsAt` with the
 * circuit's speed profile (ADR 0005), as the Track Map's dots and the Timing Tower's order do.
 */

/** What the frame reads of a circuit: where its pit lane is, its profile and its lengths. */
export type OnboardCircuit = Pick<ReplayCircuit, 'pit' | 'profile' | 'lengthM' | 'pitLengthM'>;

/** One car on screen. */
export type OnboardCar = {
  driverId: string;
  /** The lap the car is on, on its own clock. */
  lap: number;
  /** Its place in the running order, as the tower has it: furthest along the race first. */
  position: number;
  /** In the pit lane: `metres` run along the lane from its entry, not along the lap. */
  inPit: boolean;
  /** Metres from the start line along the lap, or from the pit entry along the lane. */
  metres: number;
  /** Standing still in its team's box, for the stop's stationary time; never on the lap. */
  stationary: boolean;
  /**
   * In the pit lane on a stop with a stationary time, before, during and after it; false on a
   * drive-through, which stays in the fast lane.
   */
  boxStop: boolean;
  /**
   * Drawn see-through: a car other than the one the camera rides with that is within
   * `GHOST_OVERLAP_M` of it, so two cars in one place do not hide each other.
   */
  ghost: boolean;
};

export type OnboardFrame = {
  /** The car the camera rides with; `null` when no car is running, as after the flag. */
  riding: OnboardCar | null;
  /** True when the camera rides with the leader because no followed driver is running. */
  ridingLeader: boolean;
  /**
   * The cars to draw, the one the camera rides with first. A pair at most: with a followed
   * driver, the first compared driver joins it while running; the rest of the field is only on
   * the minimap.
   */
  cars: readonly OnboardCar[];
  /** The flag over the track, as the flag banner reads it (`trackStatusAt`). */
  trackStatus: TrackStatus;
  /** The slices of the lap under a local flag, as the Track Map paints them (`flaggedSectorsAt`). */
  flagged: readonly TrackSector[];
};

/** A generic formula car's length in metres, as the Onboard view draws it. */
export const CAR_LENGTH_M = 5.6;

/**
 * How close along the track, in metres, a car must be to the one the camera rides with to be a
 * ghost: about one car length, where interpolated data puts the two bodies in one place.
 */
export const GHOST_OVERLAP_M = CAR_LENGTH_M;

const clampShare = (share: number) => Math.min(Math.max(share, 0), 1);

function onboardCar(
  driverId: string,
  car: CarLap,
  position: number,
  circuit: OnboardCircuit,
): OnboardCar {
  const share = clampShare(car.progress);
  return {
    driverId,
    lap: car.lap,
    position,
    inPit: car.inPit,
    metres: share * (car.inPit ? circuit.pitLengthM : circuit.lengthM),
    stationary: car.stationary,
    boxStop: car.boxStop,
    ghost: false,
  };
}

/**
 * Metres between two cars along the track, or `Infinity` when one is in the pit lane and the
 * other is not. On the lap the shorter way round counts, so two cars either side of the line are
 * close; the pit lane has two ends and no wrap.
 */
function gapM(a: OnboardCar, b: OnboardCar, circuit: OnboardCircuit): number {
  if (a.inPit !== b.inPit) return Number.POSITIVE_INFINITY;
  const gap = Math.abs(a.metres - b.metres);
  return a.inPit ? gap : Math.min(gap, circuit.lengthM - gap);
}

/**
 * The Onboard view at `elapsedMs`: it rides with the followed driver while that car runs, else
 * with the leader. Only with the followed driver does a compared car join, and only the first in
 * `comparedIds`; a compared car that has retired is absent, and the next one does not take its
 * place. A retired car is never on screen. The compared car is a ghost while it is within
 * `GHOST_OVERLAP_M` of the riding car along the track; the riding car never is.
 */
export function onboardFrame(
  race: ReplayRace,
  circuit: OnboardCircuit,
  elapsedMs: number,
  followedId: string | undefined,
  comparedIds: readonly string[],
): OnboardFrame {
  const raceControl = {
    trackStatus: trackStatusAt(race, elapsedMs),
    flagged: flaggedSectorsAt(race, elapsedMs),
  };
  const running = carLapsAt(race, elapsedMs, circuit.pit, circuit.profile);
  // The tower's order: furthest along first, ties in `race.drivers` order (the sort is stable).
  const order = [...running].sort((a, b) => b[1].distance - a[1].distance);
  const positions = new Map(order.map(([driverId], index) => [driverId, index + 1]));
  const carOf = (driverId: string | undefined) => {
    const car = driverId === undefined ? undefined : running.get(driverId);
    return driverId === undefined || !car
      ? null
      : onboardCar(driverId, car, positions.get(driverId)!, circuit);
  };

  const followed = carOf(followedId);
  if (followed) {
    const near = carOf(comparedIds[0]);
    const compared = near && {
      ...near,
      ghost: gapM(near, followed, circuit) <= GHOST_OVERLAP_M,
    };
    return {
      riding: followed,
      ridingLeader: false,
      cars: compared ? [followed, compared] : [followed],
      ...raceControl,
    };
  }
  const leader = carOf(order[0]?.[0]);
  return leader
    ? { riding: leader, ridingLeader: true, cars: [leader], ...raceControl }
    : { riding: null, ridingLeader: false, cars: [], ...raceControl };
}

/* ---------------------------------------------------------------------------------------------
 * Marshal light panels
 *
 * The LED panels at the side of the track, read off the same race-control state as the Track
 * Map and the flag banner, so the three never disagree about what is flying.
 * ------------------------------------------------------------------------------------------- */

/** What one marshal light panel shows. */
export type MarshalLight = 'off' | 'yellow' | 'green' | 'red';

/** How long, in race time, a panel shows green after its flag goes out, before it goes dark. */
export const GREEN_ON_CLEAR_MS = 8_000;

/** True when `share` (0 to 1 along the lap) is in the slice; a slice with `start > end` wraps. */
function inSlice({ start, end }: TrackSector, share: number): boolean {
  return start <= end ? share >= start && share < end : share >= start || share < end;
}

/**
 * What a panel at `share` shows for a flag state, with no memory of the past: red for the whole
 * lap under a red flag; yellow for the whole lap under a safety car, a virtual safety car or a
 * track-wide yellow; yellow in a slice under a local flag; dark otherwise and after the flag.
 */
function steadyLight(
  status: TrackStatus,
  flagged: readonly TrackSector[],
  share: number,
): 'yellow' | 'red' | null {
  if (status === 'red') return 'red';
  if (status === 'chequered') return null;
  if (status !== 'green') return 'yellow';
  return flagged.some((slice) => inSlice(slice, share)) ? 'yellow' : null;
}

const MESSAGE_TIMES = new WeakMap<ReplayRace, number[]>();

/** The moments race control said something, ascending, each once: where the flag state can change. */
function messageTimes(race: ReplayRace): number[] {
  const cached = MESSAGE_TIMES.get(race);
  if (cached) return cached;
  const times = [...new Set(race.raceControl.map((message) => message.atMs))].sort((a, b) => a - b);
  MESSAGE_TIMES.set(race, times);
  return times;
}

/** How many of the ascending `times` are at or before `at`. */
function countAtOrBefore(times: readonly number[], at: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle]! <= at) low = middle + 1;
    else high = middle;
  }
  return low;
}

const steadyAt = (race: ReplayRace, share: number, elapsedMs: number) =>
  steadyLight(trackStatusAt(race, elapsedMs), flaggedSectorsAt(race, elapsedMs), share);

/**
 * What the marshal light panel `share` of the way round the lap shows at `elapsedMs`: red or
 * yellow while a flag covers it (see `steadyLight`), then green for `GREEN_ON_CLEAR_MS` once the
 * flag goes out, then dark. A restart after a red flag or the end of a safety car turns every
 * panel green the same way; the chequered flag turns them all dark.
 */
export function marshalLightAt(race: ReplayRace, share: number, elapsedMs: number): MarshalLight {
  const status = trackStatusAt(race, elapsedMs);
  const now = steadyLight(status, flaggedSectorsAt(race, elapsedMs), share);
  if (now !== null) return now;
  if (status === 'chequered') return 'off';
  // Lit just before a message in the last few seconds and dark now: it went out at one of them.
  const times = messageTimes(race);
  for (let index = countAtOrBefore(times, elapsedMs) - 1; index >= 0; index--) {
    const at = times[index]!;
    if (at <= elapsedMs - GREEN_ON_CLEAR_MS) break;
    // The state just before `at` is the state at the message before it, or green before any.
    const before = index === 0 ? -1 : times[index - 1]!;
    if (steadyAt(race, share, before) !== null) return 'green';
  }
  return 'off';
}
