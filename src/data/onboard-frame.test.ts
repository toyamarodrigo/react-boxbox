import { describe, expect, it } from 'vitest';
import { circuitForRace } from './circuit-for-race';
import { onboardFrame } from './onboard-frame';
import { testReplayRace } from './replay-fixtures';
import { carLapsAt } from './replay-timing';

const race = testReplayRace();
/** The invented circuit the fixture race runs on, with its pit lane and lengths. */
const circuit = circuitForRace(race.circuit);

/** The driver ids on screen at `ms`, the car the camera rides with first. */
const onScreen = (
  ms: number,
  followedId: string | undefined,
  comparedIds: readonly string[] = [],
) => onboardFrame(race, circuit, ms, followedId, comparedIds).cars.map((car) => car.driverId);

describe('onboardFrame', () => {
  it('rides with the followed driver', () => {
    const frame = onboardFrame(race, circuit, 50_000, 'charlie', []);
    expect(frame.riding?.driverId).toBe('charlie');
    expect(frame.ridingLeader).toBe(false);
    expect(frame.cars).toHaveLength(1);
  });

  it('rides with the leader, alone, without a followed driver', () => {
    const frame = onboardFrame(race, circuit, 50_000, undefined, []);
    expect(frame.riding).toMatchObject({ driverId: 'alpha', position: 1, lap: 1 });
    expect(frame.ridingLeader).toBe(true);
    expect(frame.cars).toHaveLength(1);
  });

  it('switches to the new leader when the lead changes', () => {
    // Alpha leads lap 1; bravo, on a quicker lap 2, passes it before the line.
    expect(onScreen(10_000, undefined)).toEqual(['alpha']);
    expect(onScreen(195_000, undefined)).toEqual(['bravo']);
  });

  it('shows the followed driver and the first compared driver, no more', () => {
    expect(onScreen(50_000, 'alpha', ['charlie'])).toEqual(['alpha', 'charlie']);
    expect(onScreen(50_000, 'alpha', ['charlie', 'bravo'])).toEqual(['alpha', 'charlie']);
    expect(onScreen(50_000, 'alpha', ['delta', 'charlie', 'bravo'])).toEqual(['alpha', 'delta']);
  });

  it('shows no compared car without a followed driver', () => {
    expect(onScreen(50_000, undefined, ['charlie'])).toEqual(['alpha']);
  });

  it('leaves a retired car out, and puts no other compared car in its place', () => {
    // Delta stops after lap 2, at 326 s; charlie, a lap down, runs on to 478 s.
    expect(onScreen(250_000, 'charlie', ['delta', 'bravo'])).toEqual(['charlie', 'delta']);
    expect(onScreen(310_000, 'charlie', ['delta', 'bravo'])).toEqual(['charlie', 'delta']);
    expect(onScreen(330_000, 'charlie', ['delta', 'bravo'])).toEqual(['charlie']);
    // A retired followed driver: the camera rides with the leader instead, alone.
    const frame = onboardFrame(race, circuit, 330_000, 'delta', ['charlie']);
    expect(frame.riding?.driverId).toBe('charlie');
    expect(frame.ridingLeader).toBe(true);
    expect(frame.cars).toHaveLength(1);
  });

  it('has no car once every car has taken the flag', () => {
    const frame = onboardFrame(race, circuit, 500_000, 'alpha', ['bravo']);
    expect(frame).toEqual({ riding: null, ridingLeader: false, cars: [] });
  });

  it('places the cars where carLapsAt does, in metres along the lap or the pit lane', () => {
    const pitted = {
      ...race,
      laps: race.laps.map((lap) =>
        lap.lap === 1
          ? {
              ...lap,
              rows: lap.rows.map((row) =>
                row.driverId === 'bravo'
                  ? { ...row, inPit: true, pitDurationMs: 20_000, pitStop: 1 }
                  : row,
              ),
            }
          : lap,
      ),
    };
    for (const ms of [0, 40_000, 99_000, 105_000, 250_000]) {
      const cars = carLapsAt(pitted, ms, circuit.pit, circuit.profile);
      const frame = onboardFrame(pitted, circuit, ms, 'bravo', ['alpha']);
      for (const car of frame.cars) {
        const expected = cars.get(car.driverId)!;
        expect(car.inPit, `${car.driverId} at ${ms}`).toBe(expected.inPit);
        expect(car.lap).toBe(expected.lap);
        const length = expected.inPit ? circuit.pitLengthM : circuit.lengthM;
        expect(car.metres).toBeCloseTo(expected.progress * length, 6);
      }
    }
    // Bravo is in the lane across the line at the end of lap 1.
    expect(onboardFrame(pitted, circuit, 99_000, 'bravo', []).riding?.inPit).toBe(true);
  });

  it('gives the position the tower would', () => {
    // Bravo leads by the line at the end of lap 2: alpha second, charlie third.
    const frame = onboardFrame(race, circuit, 250_000, 'alpha', ['charlie']);
    expect(frame.cars.map((car) => car.position)).toEqual([2, 3]);
  });
});
