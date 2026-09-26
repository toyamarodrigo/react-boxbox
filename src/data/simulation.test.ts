import { describe, expect, it } from 'vitest';
import { grid } from './grid';
import { advanceRace, createInitialRace, createSeededRng } from './simulation';

const run = (seed: number, ticks: number) => {
  const rng = createSeededRng(seed);
  let state = createInitialRace(grid, rng);
  for (let index = 0; index < ticks; index++) state = advanceRace(state, rng);
  return state;
};

describe('race simulation', () => {
  it('is deterministic for a seed', () => expect(run(42, 30)).toEqual(run(42, 30)));

  it('keeps ranked positions and gaps consistent', () => {
    for (let tick = 0; tick < 30; tick++) {
      const rows = run(17, tick).rows;
      expect(rows.map((row) => row.position)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
      expect(new Set(rows.map((row) => row.driverId)).size).toBe(20);
      expect(rows[0]!.gapToLeader).toBe(0);
      expect(rows[0]!.interval).toBeNull();
      for (let index = 1; index < rows.length; index++) {
        expect(rows[index]!.interval).toBeCloseTo(
          rows[index]!.gapToLeader! - rows[index - 1]!.gapToLeader!,
          3,
        );
        expect(rows[index]!.gapToLeader!).toBeGreaterThan(rows[index - 1]!.gapToLeader!);
      }
    }
  });

  it('grants DRS from the interval to the car ahead, never from the leader gap', () => {
    let drsCount = 0;
    for (let tick = 1; tick <= 40; tick++) {
      const rows = run(3, tick).rows;
      expect(rows[0]!.drs).toBe(false);
      for (const row of rows.slice(1)) {
        const eligible = row.interval! < 1 && !row.inPit;
        expect(row.drs).toBe(eligible);
        if (row.drs) drsCount++;
      }
    }
    expect(drsCount).toBeGreaterThan(0);
  });

  it('moves drivers several places at once, so the tower has something to animate', () => {
    const rng = createSeededRng(1);
    let state = createInitialRace(grid, rng);
    let biggestMove = 0;
    let biggestPitDrop = 0;
    for (let lap = 0; lap < 70; lap++) {
      state = advanceRace(state, rng);
      // Every place one driver gains, another loses.
      expect(state.rows.reduce((sum, row) => sum + row.positionChange, 0)).toBe(0);
      for (const row of state.rows) {
        biggestMove = Math.max(biggestMove, Math.abs(row.positionChange));
        if (row.inPit) biggestPitDrop = Math.min(biggestPitDrop, row.positionChange);
      }
    }
    // A model that only swapped neighbours could never produce either of these.
    expect(biggestMove).toBeGreaterThan(1);
    expect(biggestPitDrop).toBeLessThan(-1);
  });

  it('grows the race clock by one leader lap per tick and starts at zero', () => {
    const rng = createSeededRng(23);
    let state = createInitialRace(grid, rng);
    expect(state.elapsedMs).toBe(0);
    for (let lap = 0; lap < 20; lap++) {
      const previous = state;
      state = advanceRace(state, rng);
      const leaderLapMs = Math.round(state.rows[0]!.lastLapTime! * 1000);
      expect(state.elapsedMs).toBe(previous.elapsedMs + leaderLapMs);
      expect(state.elapsedMs).toBeGreaterThan(previous.elapsedMs);
    }
    expect(createInitialRace(grid, createSeededRng(23)).elapsedMs).toBe(0);
  });

  it('wears the tyres down within bounds and fits a fresh set at a stop', () => {
    const rng = createSeededRng(11);
    let state = createInitialRace(grid, rng);
    let previous = new Map(state.rows.map((row) => [row.driverId, row.tyre.wear!]));
    let grew = 0;
    let stops = 0;
    for (const row of state.rows) {
      expect(row.tyre.wear).toBeGreaterThanOrEqual(0);
      expect(row.tyre.wear).toBeLessThanOrEqual(100);
    }
    for (let lap = 0; lap < 70; lap++) {
      state = advanceRace(state, rng);
      for (const row of state.rows) {
        const wear = row.tyre.wear!;
        expect(wear).toBeGreaterThanOrEqual(0);
        expect(wear).toBeLessThanOrEqual(100);
        const before = previous.get(row.driverId)!;
        if (row.inPit) {
          stops++;
          expect(wear).toBe(0);
        } else if (before < 100) {
          grew++;
          expect(wear).toBeGreaterThan(before);
        }
      }
      previous = new Map(state.rows.map((row) => [row.driverId, row.tyre.wear!]));
    }
    expect(stops).toBeGreaterThan(0);
    expect(grew).toBeGreaterThan(0);
  });

  it('uses valid sector statuses and resets tyre age on pit stops', () => {
    let pitCount = 0;
    for (let tick = 1; tick <= 60; tick++) {
      for (const row of run(7, tick).rows) {
        for (const sector of row.sectors) {
          expect(['fastest', 'personal', 'slower', 'unset']).toContain(sector.status);
          expect(sector.time).toBeGreaterThan(0);
        }
        if (row.inPit) {
          pitCount++;
          expect(row.tyre.age).toBe(0);
        }
      }
    }
    expect(pitCount).toBeGreaterThan(0);
  });

  it('runs green, closes on the chequered flag, and raises every caution at some point', () => {
    const seen = new Set<string>();
    let greenLaps = 0;
    let laps = 0;
    let lastStatus = '';
    for (let seed = 0; seed < 60; seed++) {
      const rng = createSeededRng(seed);
      let state = createInitialRace(grid, rng);
      for (let lap = 0; lap < state.totalLaps; lap++) {
        state = advanceRace(state, rng);
        seen.add(state.trackStatus);
        if (state.trackStatus === 'green') greenLaps++;
        laps++;
      }
      lastStatus = state.trackStatus;
    }
    expect(lastStatus).toBe('chequered');
    // Green is the normal state; the cautions are rare branches off the same roll.
    expect(greenLaps / laps).toBeGreaterThan(0.9);
    for (const status of ['green', 'yellow', 'vsc', 'double-yellow', 'chequered']) {
      expect(seen).toContain(status);
    }
    expect(seen.has('red')).toBe(false);
  });

  it('traps a speed for every car from the first lap and keeps the best of the session', () => {
    const grid20 = run(5, 0);
    expect(Object.values(grid20.speedTrap.byDriver).every((speed) => speed === null)).toBe(true);
    expect(grid20.speedTrap.best).toBeNull();

    let best = 0;
    for (let tick = 1; tick <= 30; tick++) {
      const state = run(5, tick);
      const readings = state.rows.map((row) => state.speedTrap.byDriver[row.driverId]);
      expect(readings).toHaveLength(20);
      // Only a car in the pit lane misses the trap, so a lap is never entirely blank.
      const taken = readings.filter((speed): speed is number => speed !== null);
      expect(taken.length).toBeGreaterThan(15);
      for (const speed of taken) {
        expect(speed).toBeGreaterThanOrEqual(310);
        expect(speed).toBeLessThanOrEqual(345);
        expect(Number.isInteger(speed)).toBe(true);
      }
      best = Math.max(best, ...taken);
      expect(state.speedTrap.best?.speed).toBe(best);
      expect(state.speedTrap.byDriver[state.speedTrap.best!.driverId]).not.toBeUndefined();
    }
  });

  it('keeps the trap seeded, so the same race reads the same speeds', () => {
    expect(run(8, 12).speedTrap).toEqual(run(8, 12).speedTrap);
    expect(run(8, 12).speedTrap.byDriver).not.toEqual(run(8, 13).speedTrap.byDriver);
  });
});
