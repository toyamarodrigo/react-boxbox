import type { ReplayCircuit } from './circuit-for-race';
import type { ReplayRace } from './replay-schema';
import { type CarLap, carLapsAt } from './replay-timing';

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
};

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
  };
}

/**
 * The Onboard view at `elapsedMs`: it rides with the followed driver while that car runs, else
 * with the leader. Only with the followed driver does a compared car join, and only the first in
 * `comparedIds`; a compared car that has retired is absent, and the next one does not take its
 * place. A retired car is never on screen.
 */
export function onboardFrame(
  race: ReplayRace,
  circuit: OnboardCircuit,
  elapsedMs: number,
  followedId: string | undefined,
  comparedIds: readonly string[],
): OnboardFrame {
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
    const compared = carOf(comparedIds[0]);
    return {
      riding: followed,
      ridingLeader: false,
      cars: compared ? [followed, compared] : [followed],
    };
  }
  const leader = carOf(order[0]?.[0]);
  return leader
    ? { riding: leader, ridingLeader: true, cars: [leader] }
    : { riding: null, ridingLeader: false, cars: [] };
}
