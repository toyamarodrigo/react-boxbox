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
});
