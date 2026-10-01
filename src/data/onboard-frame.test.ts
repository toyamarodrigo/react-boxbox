import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { circuitForRace } from './circuit-for-race';
import { GHOST_OVERLAP_M, onboardFrame } from './onboard-frame';
import { boxShare } from './pit-garages';
import { generatedReplayFiles, readJson, testReplayRace } from './replay-fixtures';
import { type ReplayRace, replayRaceSchema } from './replay-schema';
import { carLapsAt, replayPitStops } from './replay-timing';

const race = testReplayRace();
/** The invented circuit the fixture race runs on, with its pit lane and lengths. */
const circuit = circuitForRace(race.circuit);

/** The driver ids on screen at `ms`, the car the camera rides with first. */
const onScreen = (
  ms: number,
  followedId: string | undefined,
  comparedIds: readonly string[] = [],
) => onboardFrame(race, circuit, ms, followedId, comparedIds).cars.map((car) => car.driverId);

/** The ghost flags on screen at `ms`, the car the camera rides with first. */
const ghosts = (race: ReplayRace, ms: number, followedId: string, comparedIds: string[]) =>
  onboardFrame(race, circuit, ms, followedId, comparedIds).cars.map((car) => car.ghost);

/** Metres between the two cars on screen, along the lap, the line not accounted for. */
const rawGap = (ms: number) => {
  const [a, b] = onboardFrame(race, circuit, ms, 'alpha', ['bravo']).cars;
  return Math.abs(a!.metres - b!.metres);
};

/**
 * The fixture with bravo 30 ms behind alpha at the end of lap 1, so the two are a few metres
 * apart either side of the line, and with `pitting` in the pit lane across it.
 */
const nearTheLine = (pitting: readonly string[]): ReplayRace => ({
  ...race,
  laps: race.laps.map((lap) => ({
    ...lap,
    rows: lap.rows.map((row) => {
      const bravo = row.driverId === 'bravo';
      const timed =
        bravo && lap.lap === 1
          ? { ...row, lapTimeMs: 100_030, cumulativeMs: 100_030 }
          : bravo && lap.lap === 2
            ? { ...row, lapTimeMs: 98_970 }
            : row;
      return lap.lap === 1 && pitting.includes(row.driverId)
        ? { ...timed, inPit: true, pitDurationMs: 20_000, pitStop: 1 }
        : timed;
    }),
  })),
});

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

  it('makes the compared car a ghost only within one car length of the riding car', () => {
    // Bravo, on a quicker lap 2, closes on alpha and passes it near half distance.
    expect(rawGap(140_000)).toBeGreaterThan(GHOST_OVERLAP_M);
    expect(ghosts(race, 140_000, 'alpha', ['bravo'])).toEqual([false, false]);
    expect(rawGap(150_000)).toBeLessThanOrEqual(GHOST_OVERLAP_M);
    expect(ghosts(race, 150_000, 'alpha', ['bravo'])).toEqual([false, true]);
    expect(rawGap(160_000)).toBeGreaterThan(GHOST_OVERLAP_M);
    expect(ghosts(race, 160_000, 'alpha', ['bravo'])).toEqual([false, false]);
  });

  it('never makes the car the camera rides with a ghost', () => {
    expect(ghosts(race, 150_000, 'bravo', ['alpha'])).toEqual([false, true]);
    expect(onboardFrame(race, circuit, 150_000, undefined, []).riding?.ghost).toBe(false);
  });

  it('turns the ghost solid again once clear', () => {
    const flags: boolean[] = [];
    for (let ms = 130_000; ms <= 170_000; ms += 100) {
      const [riding, compared] = ghosts(race, ms, 'alpha', ['bravo']);
      expect(riding).toBe(false);
      if (flags.at(-1) !== compared) flags.push(compared!);
    }
    // Solid, then a ghost while the two overlap, then solid for good.
    expect(flags).toEqual([false, true, false]);
  });

  it('measures the gap the short way round across the line', () => {
    const frame = onboardFrame(nearTheLine([]), circuit, 100_010, 'alpha', ['bravo']);
    const [alpha, bravo] = frame.cars;
    expect(alpha!.metres).toBeLessThan(1);
    expect(bravo!.metres).toBeGreaterThan(circuit.lengthM - 1);
    expect(bravo!.ghost).toBe(true);
  });

  it('does not compare a car in the pit lane with one on the track', () => {
    // Alpha is in the lane and bravo on the track, the two metre counts a car length apart.
    const split = onboardFrame(nearTheLine(['alpha']), circuit, 107_000, 'alpha', ['bravo']);
    const [alpha, bravo] = split.cars;
    expect([alpha!.inPit, bravo!.inPit]).toEqual([true, false]);
    expect(Math.abs(alpha!.metres - bravo!.metres)).toBeLessThan(GHOST_OVERLAP_M);
    expect(bravo!.ghost).toBe(false);
    // Both in the lane, close together: the compared car is a ghost there too.
    expect(ghosts(nearTheLine(['alpha', 'bravo']), 100_010, 'alpha', ['bravo'])).toEqual([
      false,
      true,
    ]);
  });
});

describe('onboardFrame in the pit lane', () => {
  const load = (fileName: string) => {
    const file = generatedReplayFiles().find((name) => path.basename(name) === fileName);
    return file ? replayRaceSchema.parse(readJson(file)) : null;
  };
  /** Every 10 ms from a second before the stop to a second after it, the riding car's flag. */
  const ridingThrough = (
    on: ReplayRace,
    stop: { driverId: string; atMs: number; durationMs: number },
  ) => {
    const onCircuit = circuitForRace(on.circuit);
    const frames = [];
    for (let ms = stop.atMs - 1_000; ms < stop.atMs + stop.durationMs + 1_000; ms += 10) {
      frames.push(onboardFrame(on, onCircuit, ms, stop.driverId, []).riding!);
    }
    return { frames, onCircuit };
  };

  const melbourne = load('2026-1.json');
  it.skipIf(melbourne === null)('stands the car in its box only for its stationary time', () => {
    const race = melbourne!;
    const shape = circuitForRace(race.circuit).pit;
    // Alonso on lap 11: 25.895 s in the lane, 10 s of it in the box.
    const stop = replayPitStops(race, shape).find((s) => s.driverId === 'alonso' && s.lap === 11)!;
    const { frames, onCircuit } = ridingThrough(race, stop);
    const still = frames.filter((car) => car.stationary);
    expect(Math.abs(still.length * 10 - 10_000)).toBeLessThanOrEqual(10);
    // One unbroken stretch, in the lane, in front of the team's garage.
    const first = frames.findIndex((car) => car.stationary);
    expect(frames.slice(first, first + still.length).every((car) => car.stationary)).toBe(true);
    for (const car of still) {
      expect(car.inPit).toBe(true);
      expect(car.metres).toBeCloseTo(boxShare(race, 'alonso') * onCircuit.pitLengthM, 6);
    }
    expect(frames[0]!.stationary).toBe(false);
    expect(frames.at(-1)!.stationary).toBe(false);
  });

  const lasVegas = load('2023-21.json');
  it.skipIf(lasVegas === null)('never stops a car in a race before stationary times', () => {
    const race = lasVegas!;
    const shape = circuitForRace(race.circuit).pit;
    for (const stop of replayPitStops(race, shape).slice(0, 6)) {
      expect(ridingThrough(race, stop).frames.some((car) => car.stationary)).toBe(false);
    }
  });

  it('is never stationary on the lap', () => {
    for (const ms of [0, 40_000, 99_000, 105_000]) {
      for (const car of onboardFrame(race, circuit, ms, 'alpha', ['bravo']).cars) {
        expect(car.stationary).toBe(false);
      }
    }
  });
});
