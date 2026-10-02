import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { circuitForRace } from './circuit-for-race';
import {
  GHOST_OVERLAP_M,
  GREEN_ON_CLEAR_MS,
  type MarshalLight,
  marshalLightAt,
  onboardFrame,
} from './onboard-frame';
import { boxShare } from './pit-garages';
import { generatedReplayFiles, readJson, testReplayRace } from './replay-fixtures';
import { type ReplayRace, replayRaceSchema } from './replay-schema';
import {
  carLapsAt,
  flaggedSectorsAt,
  leaderCumulative,
  replayPitStops,
  trackStatusAt,
} from './replay-timing';

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
    expect(frame).toMatchObject({ riding: null, ridingLeader: false, cars: [] });
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
    // A box stop the whole way through the lane, so the car can pull into the working lane.
    expect(frames.every((car) => car.boxStop === car.inPit)).toBe(true);
  });

  const lasVegas = load('2023-21.json');
  it.skipIf(lasVegas === null)('never stops a car in a race before stationary times', () => {
    const race = lasVegas!;
    const shape = circuitForRace(race.circuit).pit;
    for (const stop of replayPitStops(race, shape).slice(0, 6)) {
      const { frames } = ridingThrough(race, stop);
      expect(frames.some((car) => car.stationary || car.boxStop)).toBe(false);
    }
  });

  it('is never stationary on the lap', () => {
    for (const ms of [0, 40_000, 99_000, 105_000]) {
      for (const car of onboardFrame(race, circuit, ms, 'alpha', ['bravo']).cars) {
        expect(car.stationary).toBe(false);
        expect(car.boxStop).toBe(false);
      }
    }
  });
});

describe('onboardFrame race control', () => {
  it('carries the flag over the track and the flagged slices, as the readers have them', () => {
    for (const ms of [0, 30_000, 35_000, 60_000, 120_000, 150_000, 250_000, 280_000, 500_000]) {
      const frame = onboardFrame(race, circuit, ms, 'alpha', []);
      expect(frame.trackStatus, `${ms}`).toBe(trackStatusAt(race, ms));
      // The same array, so the Track Map and the Onboard view paint the same slices.
      expect(frame.flagged, `${ms}`).toBe(flaggedSectorsAt(race, ms));
    }
    expect(onboardFrame(race, circuit, 70_000, undefined, []).trackStatus).toBe('vsc');
    expect(onboardFrame(race, circuit, 40_000, undefined, []).flagged).toEqual([
      { start: 0.25, end: 0.75, status: 'yellow' },
    ]);
  });

  const monzaFile = generatedReplayFiles().find((name) => path.basename(name) === '2026-13.json');
  it.skipIf(!monzaFile)('agrees with the readers through the Monza 2026 flags', () => {
    const monza = replayRaceSchema.parse(readJson(monzaFile!));
    const onMonza = circuitForRace(monza.circuit);
    const statusAt = (ms: number) => onboardFrame(monza, onMonza, ms, undefined, []).trackStatus;
    // Lap 3: yellows in sectors 14 to 16, then the safety car, then the red until the restart.
    expect(statusAt(190_000)).toBe('green');
    expect(onboardFrame(monza, onMonza, 190_000, undefined, []).flagged).not.toHaveLength(0);
    expect(statusAt(200_000)).toBe('sc');
    expect(statusAt(260_000)).toBe('red');
    expect(statusAt(leaderCumulative(monza, 3) + 60_000)).toBe('red');
    expect(statusAt(2_130_000)).toBe('green');
    // Laps 28 and 29: a virtual safety car.
    expect(statusAt(4_500_000)).toBe('vsc');
    expect(statusAt(4_580_000)).toBe('green');
    const moments = [
      190_000, 200_000, 260_000, 400_000, 600_000, 2_130_000, 2_585_000, 4_445_000, 4_500_000,
      4_580_000,
    ];
    for (const ms of moments) {
      const frame = onboardFrame(monza, onMonza, ms, undefined, []);
      expect(frame.trackStatus, `${ms}`).toBe(trackStatusAt(monza, ms));
      expect(frame.flagged, `${ms}`).toBe(flaggedSectorsAt(monza, ms));
    }
  });
});

describe('marshalLightAt', () => {
  // The fixture's messages mention sector 4 at most: sector 2 is 0.25–0.5, sector 3 0.5–0.75.
  const light = (share: number, ms: number) => marshalLightAt(race, share, ms);

  it('is dark while nothing covers the panel', () => {
    expect(light(0.1, 0)).toBe('off');
    expect(light(0.1, 30_000)).toBe('off');
    expect(light(0.9, 40_000)).toBe('off');
  });

  it('is yellow in a flagged slice, and only there', () => {
    expect(light(0.3, 30_000)).toBe('yellow');
    expect(light(0.6, 30_000)).toBe('off');
    expect(light(0.6, 35_000)).toBe('yellow');
  });

  it('turns every panel yellow under a virtual safety car or a track-wide yellow', () => {
    for (const share of [0.1, 0.3, 0.6, 0.9]) {
      expect(light(share, 60_000)).toBe('yellow');
      expect(light(share, 260_000)).toBe('yellow');
    }
  });

  it('shows green for a moment when its flag goes out, then goes dark', () => {
    // Sector 2 clears at 150 s.
    expect(light(0.3, 149_999)).toBe('yellow');
    expect(light(0.3, 150_000)).toBe('green');
    expect(light(0.3, 150_000 + GREEN_ON_CLEAR_MS - 1)).toBe('green');
    expect(light(0.3, 150_000 + GREEN_ON_CLEAR_MS)).toBe('off');
    // Sector 3 next to it is still flagged.
    expect(light(0.6, 150_000)).toBe('yellow');
  });

  it('turns the whole lap green when the virtual safety car ends, but a flagged slice stays yellow', () => {
    expect(light(0.1, 120_000)).toBe('green');
    expect(light(0.9, 120_000 + GREEN_ON_CLEAR_MS - 1)).toBe('green');
    expect(light(0.9, 120_000 + GREEN_ON_CLEAR_MS)).toBe('off');
    expect(light(0.3, 120_000)).toBe('yellow');
  });

  it('turns green everywhere when the green flag puts everything out', () => {
    for (const share of [0.1, 0.6]) {
      expect(light(share, 280_000)).toBe('green');
      expect(light(share, 290_000)).toBe('off');
    }
  });

  it('reads a slice that wraps across the line', () => {
    const across: ReplayRace = {
      ...race,
      raceControl: [4, 1].map((sector) => ({
        atMs: 10_000,
        lap: 1,
        flag: 'YELLOW',
        category: 'Flag',
        scope: 'Sector',
        sector,
        driverId: null,
        message: `YELLOW IN TRACK SECTOR ${sector}`,
      })),
    };
    expect(marshalLightAt(across, 0.95, 20_000)).toBe('yellow');
    expect(marshalLightAt(across, 0.05, 20_000)).toBe('yellow');
    expect(marshalLightAt(across, 0.5, 20_000)).toBe('off');
  });

  const monzaFile = generatedReplayFiles().find((name) => path.basename(name) === '2026-13.json');
  it.skipIf(!monzaFile)(
    'lights the Monza 2026 lap red for the stoppage and green at the restart',
    () => {
      const monza = replayRaceSchema.parse(readJson(monzaFile!));
      const lap = (ms: number) =>
        [0.05, 0.3, 0.55, 0.9].map((share) => marshalLightAt(monza, share, ms)) as MarshalLight[];
      expect(lap(200_000)).toEqual(['yellow', 'yellow', 'yellow', 'yellow']);
      expect(lap(600_000)).toEqual(['red', 'red', 'red', 'red']);
      // The session starts again at 2129.166 s.
      expect(lap(2_130_000)).toEqual(['green', 'green', 'green', 'green']);
      expect(lap(2_129_166 + GREEN_ON_CLEAR_MS)).toEqual(['off', 'off', 'off', 'off']);
      expect(lap(4_500_000)).toEqual(['yellow', 'yellow', 'yellow', 'yellow']);
    },
  );
});
