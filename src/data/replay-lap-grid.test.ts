import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatedReplayFiles, readJson, testReplayRace } from './replay-fixtures';
import { type ReplayRace, replayRaceSchema } from './replay-schema';
import {
  LAP_GRID_MEASURES,
  type LapGridCell,
  hasSectorTimes,
  lapGrid,
  lapGridIntensity,
  lapGridSummary,
  lapGridTooltip,
  lapGridVisible,
} from './replay-lap-grid';
import { neutralisationPeriods, trackStatusAt } from './replay-timing';

const race = testReplayRace();

/** One car's cells for a measure; the fixture's cars all have some. */
const cellsOf = (from: ReplayRace, driverId: string, measure: 'lap' | 's1' | 's2' | 's3' = 'lap') =>
  lapGrid(from, measure).get(driverId) ?? [];

const statuses = (cells: readonly LapGridCell[]) => cells.map((cell) => cell.status);

/** The fixture with its lap rows edited in place: a copy, so the shared fixture never changes. */
function edited(edit: (copy: ReplayRace) => void): ReplayRace {
  const copy = structuredClone(race);
  edit(copy);
  return copy;
}

const rowOf = (from: ReplayRace, lap: number, driverId: string) => {
  const row = from.laps[lap - 1]?.rows.find((entry) => entry.driverId === driverId);
  if (row === undefined) throw new Error(`no row for ${driverId} on lap ${lap}`);
  return row;
};

describe('lapGrid', () => {
  it('gives every car one cell per lap it ran, the retired car ending at its last lap', () => {
    const grid = lapGrid(race, 'lap');
    expect([...grid.keys()]).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    expect(cellsOf(race, 'alpha').map((cell) => cell.lap)).toEqual([1, 2, 3]);
    expect(cellsOf(race, 'delta').map((cell) => cell.lap)).toEqual([1, 2]);
    // Each cell is drawn from the moment the car completes the lap.
    expect(cellsOf(race, 'charlie').map((cell) => cell.at)).toEqual([160_000, 320_000, 478_000]);
  });

  it('never counts the opening lap, and counts a lap that overlaps the virtual safety car as neutralised', () => {
    for (const cells of lapGrid(race, 'lap').values()) {
      expect(cells[0]?.status).toBe('excluded');
      // Every opening lap runs into the VSC deployed at 60 s as well, and says so.
      expect(cells[0]?.reasons).toEqual(['first-lap', 'vsc']);
    }
    // The VSC runs from 60 s to 120 s: alpha's and bravo's second laps start at 100 s and 101 s,
    // inside it; charlie's starts at 160 s, after it.
    expect(cellsOf(race, 'alpha')[1]?.reasons).toEqual(['vsc']);
    expect(cellsOf(race, 'bravo')[1]?.reasons).toEqual(['vsc']);
    expect(cellsOf(race, 'charlie')[1]?.reasons).toEqual([]);
  });

  it('colours a lap as of the moment it was set, against counted laps only', () => {
    // Bravo's 98.0 at 297 s is the first counted lap of the race; alpha's 99.0 two seconds later
    // is only its own best, and charlie's 160.0 at 320 s is the same.
    expect(statuses(cellsOf(race, 'bravo'))).toEqual(['excluded', 'excluded', 'fastest']);
    expect(statuses(cellsOf(race, 'alpha'))).toEqual(['excluded', 'excluded', 'personal']);
    expect(statuses(cellsOf(race, 'charlie'))).toEqual(['excluded', 'personal', 'personal']);
  });

  it('measures a slower lap against the personal best at that moment', () => {
    const slower = edited((copy) => {
      rowOf(copy, 3, 'charlie').lapTimeMs = 162_345;
    });
    const last = cellsOf(slower, 'charlie')[2];
    expect(last?.status).toBe('slower');
    expect(last?.deltaMs).toBe(2345);
  });

  it('treats a tie with the race best as the race best, as the sector card does', () => {
    const tied = edited((copy) => {
      rowOf(copy, 3, 'alpha').lapTimeMs = 98_000;
    });
    expect(cellsOf(tied, 'alpha')[2]?.status).toBe('fastest');
  });

  it('never lets an excluded lap set a best', () => {
    // Alpha's in-lap is the fastest lap anyone runs, and the lap after it is an out-lap: neither
    // counts, so bravo's 98.0 is still the race best and alpha's 99.0 still a personal best.
    const stopped = edited((copy) => {
      copy.raceControl = [];
      const inLap = rowOf(copy, 2, 'alpha');
      inLap.pitStop = 1;
      inLap.inPit = true;
      inLap.lapTimeMs = 90_000;
    });
    expect(cellsOf(stopped, 'alpha')[1]?.reasons).toEqual(['in-lap']);
    expect(cellsOf(stopped, 'alpha')[2]?.reasons).toEqual(['out-lap']);
    expect(statuses(cellsOf(stopped, 'bravo'))).toEqual(['excluded', 'fastest', 'fastest']);
  });

  it('keeps every reason that applies, in a fixed order', () => {
    const both = edited((copy) => {
      rowOf(copy, 2, 'bravo').pitStop = 1;
    });
    expect(cellsOf(both, 'bravo')[1]?.reasons).toEqual(['in-lap', 'vsc']);
  });

  it('draws a sector the source never timed as an empty cell', () => {
    expect(cellsOf(race, 'charlie', 's2')[1]?.status).toBe('unset');
    expect(cellsOf(race, 'charlie', 's1')[1]?.status).toBe('personal');
  });

  it('is built once per race and measure', () => {
    expect(lapGrid(race, 'lap')).toBe(lapGrid(race, 'lap'));
    expect(lapGrid(race, 's1')).not.toBe(lapGrid(race, 'lap'));
  });
});

describe('lapGridVisible', () => {
  it('counts the cells whose lap the clock has completed', () => {
    const cells = cellsOf(race, 'charlie');
    expect(lapGridVisible(cells, 0)).toBe(0);
    expect(lapGridVisible(cells, 159_999)).toBe(0);
    expect(lapGridVisible(cells, 160_000)).toBe(1);
    expect(lapGridVisible(cells, 400_000)).toBe(2);
    expect(lapGridVisible(cells, 1_000_000)).toBe(3);
  });
});

describe('lapGridIntensity', () => {
  it('runs from nothing at the personal best to full at three seconds, and no further', () => {
    expect(lapGridIntensity(0)).toBe(0);
    expect(lapGridIntensity(1500)).toBe(0.5);
    expect(lapGridIntensity(3000)).toBe(1);
    expect(lapGridIntensity(9000)).toBe(1);
  });
});

describe('lapGridTooltip', () => {
  const cell = (fields: Partial<LapGridCell>): LapGridCell => ({
    lap: 23,
    ms: 92_418,
    status: 'slower',
    deltaMs: 412,
    reasons: [],
    at: 0,
    ...fields,
  });

  it('writes the delta to the personal best, or names the best', () => {
    expect(lapGridTooltip(cell({}), 'lap')).toBe('Lap 23 · 1:32.418 · +0.412 to PB');
    expect(lapGridTooltip(cell({ status: 'personal' }), 'lap')).toBe(
      'Lap 23 · 1:32.418 · personal best',
    );
    expect(lapGridTooltip(cell({ status: 'fastest', ms: 28_123 }), 's1')).toBe(
      'Lap 23 · S1 28.123 · race best',
    );
  });

  it('names why a lap is not counted, and says when there is no time', () => {
    expect(lapGridTooltip(cell({ status: 'excluded', reasons: ['out-lap', 'red'] }), 'lap')).toBe(
      'Lap 23 · 1:32.418 · out-lap, red flag, not counted',
    );
    expect(lapGridTooltip(cell({ status: 'unset', ms: null }), 's2')).toBe('Lap 23 · no time');
  });
});

describe('lapGridSummary', () => {
  it('says the best counted figure, where it was set and how many bests of each colour', () => {
    expect(lapGridSummary('ALP', cellsOf(race, 'alpha'), 'lap')).toBe(
      'ALP, best lap 1:39.000 on lap 3, 1 personal best, 0 race bests',
    );
    expect(lapGridSummary('CHA', cellsOf(race, 'charlie'), 'lap')).toBe(
      'CHA, best lap 2:38.000 on lap 3, 2 personal bests, 0 race bests',
    );
  });

  it('only reads the cells it is handed, so it never gets ahead of the clock', () => {
    const cells = cellsOf(race, 'bravo');
    expect(lapGridSummary('BRA', cells.slice(0, 2), 'lap')).toBe('BRA, no counted lap yet');
    expect(lapGridSummary('BRA', cells, 's1')).toMatch(/^BRA, best S1 /);
  });
});

describe('lap grid on the generated dataset', () => {
  const files = generatedReplayFiles();
  if (files.length === 0) {
    it.skip('is not generated yet, so the dataset checks are skipped', () => {});
    return;
  }
  const races = files.map(
    (file) => [path.basename(file), replayRaceSchema.parse(readJson(file))] as const,
  );

  /** Every cell of a measure with its car, in the order the race clock completed them. */
  const byClock = (real: ReplayRace, measure: (typeof LAP_GRID_MEASURES)[number]) =>
    [...lapGrid(real, measure)]
      .flatMap(([driverId, cells]) => cells.map((cell) => ({ driverId, cell })))
      .sort((a, b) => a.cell.at - b.cell.at);

  it.each(races)('%s: a race best only ever gets faster', (_name, real) => {
    for (const measure of LAP_GRID_MEASURES) {
      let best = Number.POSITIVE_INFINITY;
      for (const { cell } of byClock(real, measure)) {
        if (cell.status !== 'fastest' || cell.ms === null) continue;
        expect(cell.ms, `${measure} lap ${cell.lap}`).toBeLessThanOrEqual(best);
        best = cell.ms;
      }
    }
  });

  it.each(races)('%s: bests are measured against counted laps only', (_name, real) => {
    for (const measure of LAP_GRID_MEASURES) {
      let raceBest = Number.POSITIVE_INFINITY;
      const carBests = new Map<string, number>();
      for (const { driverId, cell } of byClock(real, measure)) {
        // An excluded lap is skipped here, so if it had set a best the checks below would fail.
        if (cell.status === 'excluded' || cell.status === 'unset' || cell.ms === null) continue;
        const carBest = carBests.get(driverId) ?? Number.POSITIVE_INFINITY;
        const label = `${driverId} ${measure} lap ${cell.lap}`;
        if (cell.status === 'fastest') expect(cell.ms, label).toBeLessThanOrEqual(raceBest);
        if (cell.status === 'personal') {
          expect(cell.ms, label).toBeGreaterThan(raceBest);
          expect(cell.ms, label).toBeLessThanOrEqual(carBest);
        }
        if (cell.status === 'slower') {
          expect(cell.ms, label).toBeGreaterThan(carBest);
          expect(cell.deltaMs, label).toBe(cell.ms - carBest);
        }
        raceBest = Math.min(raceBest, cell.ms);
        carBests.set(driverId, Math.min(carBest, cell.ms));
      }
    }
  });

  it.each(races)('%s: the lap after a stop is the out-lap', (_name, real) => {
    const cells = lapGrid(real, 'lap');
    for (const entry of real.laps) {
      for (const row of entry.rows) {
        if (row.pitStop === null) continue;
        const own = cells.get(row.driverId) ?? [];
        expect(own.find((cell) => cell.lap === entry.lap)?.reasons).toContain('in-lap');
        const next = own.find((cell) => cell.lap === entry.lap + 1);
        // A car that stopped on its last lap has no out-lap to mark.
        if (next !== undefined) expect(next.reasons).toContain('out-lap');
      }
    }
  });

  it.each(races)('%s: neutralised laps are the laps the Phase 10 periods cover', (_name, real) => {
    const periods = neutralisationPeriods(real);
    const grid = lapGrid(real, 'lap');
    for (const cells of grid.values()) {
      for (const cell of cells) {
        const start = cell.at - (cell.ms ?? 0);
        // Asked of the state machine the map and the banner read, once a second over the lap. A
        // lap that only grazes a period may fall between two samples; one that shows a status in
        // any sample must be marked with it.
        const flown = new Set<string>();
        for (let at = start; at < cell.at; at += 1000) flown.add(trackStatusAt(real, at));
        for (const status of ['sc', 'vsc', 'red'] as const) {
          if (cell.reasons.includes(status)) {
            const inPeriod = periods.some(
              (period) =>
                period.status === status && start < period.toMs && cell.at > period.fromMs,
            );
            expect(inPeriod).toBe(true);
          }
          if (flown.has(status))
            expect(cell.reasons, `lap ${cell.lap} ${status}`).toContain(status);
        }
      }
    }
    // And every period is on the grid: some car has a neutralised cell on its first lap.
    for (const period of periods) {
      const first = [...grid.values()].some((cells) =>
        cells.some((cell) => cell.lap === period.fromLap && cell.reasons.includes(period.status)),
      );
      expect(first, `${period.status} from lap ${period.fromLap}`).toBe(true);
    }
  });

  it('has no sector data for 2021-22, and sectors for every later race', () => {
    for (const [name, real] of races) {
      expect(hasSectorTimes(real), name).toBe(real.season > 2022);
    }
    const abuDhabi = races.find(([name]) => name === '2021-22.json')?.[1];
    if (abuDhabi === undefined) return;
    for (const cells of lapGrid(abuDhabi, 's1').values()) {
      for (const cell of cells) expect(['unset', 'excluded']).toContain(cell.status);
    }
  });

  it('marks São Paulo 2024 laps into its red flag with both the stoppage and the tyre change', () => {
    const saoPaulo = races.find(([name]) => name === '2024-21.json')?.[1];
    if (saoPaulo === undefined) return;
    const red = [...lapGrid(saoPaulo, 'lap').values()]
      .flat()
      .filter((cell) => cell.reasons.includes('red'));
    expect(red.length).toBeGreaterThan(0);
    expect(red.some((cell) => cell.reasons.includes('out-lap'))).toBe(true);
  });
});
