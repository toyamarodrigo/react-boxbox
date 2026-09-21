import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { grid } from '@/data/grid';
import { useRaceSimulation } from '@/data/use-race-simulation';
import type { Driver, SectorTime, Team, TimingRow } from '@/registry/boxbox/lib/types';
import {
  pointsForPosition,
  podiumSteps,
  useResultsPresentation,
  withResultPoints,
} from './use-results-presentation';

afterEach(() => vi.useRealTimers());

const emptySectors = (): [SectorTime, SectorTime, SectorTime] => [
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
];

function makeRow(driverId: string, position: number, gapToLeader: number): TimingRow {
  return {
    driverId,
    position,
    gapToLeader,
    interval: position === 1 ? null : 1,
    lastLapTime: 91.5,
    bestLapTime: 91.2,
    sectors: emptySectors(),
    tyre: { compound: 'S', age: 4 },
    inPit: false,
    lapped: false,
    drs: false,
    positionChange: 0,
  };
}

const drivers: Record<string, Driver> = {
  one: { id: 'one', code: 'AAA', number: 1, firstName: 'Ada', lastName: 'One', teamId: 'red' },
  two: { id: 'two', code: 'BBB', number: 2, firstName: 'Bea', lastName: 'Two', teamId: 'red' },
  three: { id: 'three', code: 'CCC', number: 3, firstName: 'Cid', lastName: 'Tri', teamId: 'blue' },
};
const teams: Record<string, Team> = {
  red: { id: 'red', name: 'Aster Forge', color: '#C78B46' },
  blue: { id: 'blue', name: 'Quartz Vale', color: '#8146A8' },
};

const rows = [makeRow('one', 1, 0), makeRow('two', 2, 4.512), makeRow('three', 3, 11.986)];

describe('pointsForPosition', () => {
  it('follows the standard table and stops after tenth', () => {
    expect(pointsForPosition(1)).toBe(25);
    expect(pointsForPosition(2)).toBe(18);
    expect(pointsForPosition(10)).toBe(1);
    expect(pointsForPosition(11)).toBeUndefined();
  });
});

describe('withResultPoints', () => {
  it('scores every row and classifies it as finished', () => {
    const scored = withResultPoints(rows);
    expect(scored.map((row) => row.points)).toEqual([25, 18, 15]);
    expect(scored.every((row) => row.finishStatus === 'finished')).toBe(true);
  });
});

describe('podiumSteps', () => {
  it('reads the top three in P1, P2, P3 order with their tower value as the detail', () => {
    const steps = podiumSteps(rows, drivers, teams);
    expect(steps?.map((step) => step.driver.code)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(steps?.map((step) => step.detail)).toEqual(['WINNER', '+4.512', '+12.0']);
    expect(steps?.[0]?.team.name).toBe('Aster Forge');
  });

  it('gives nothing back when the top three are not all there', () => {
    expect(podiumSteps(rows.slice(0, 2), drivers, teams)).toBeNull();
    expect(podiumSteps(rows, { one: drivers.one! }, teams)).toBeNull();
  });
});

describe('useResultsPresentation', () => {
  it('leaves the rows and the mode alone while the race runs', () => {
    const { result } = renderHook(() =>
      useResultsPresentation({ rows, mode: 'leader', finished: false, drivers, teams }),
    );
    expect(result.current.mode).toBe('leader');
    expect(result.current.podium).toBeNull();
    expect(result.current.rows.every((row) => row.points === undefined)).toBe(true);
  });

  it('scores the rows and builds the podium once the race is over', () => {
    const { result } = renderHook(() =>
      useResultsPresentation({ rows, mode: 'leader', finished: true, drivers, teams }),
    );
    expect(result.current.mode).toBe('results');
    expect(result.current.rows.map((row) => row.points)).toEqual([25, 18, 15]);
    expect(result.current.podium?.map((step) => step.driver.code)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('does the same when results mode is picked by hand', () => {
    const { result } = renderHook(() =>
      useResultsPresentation({ rows, mode: 'results', finished: false, drivers, teams }),
    );
    expect(result.current.mode).toBe('results');
    expect(result.current.podium).not.toBeNull();
  });

  it('flips to results when the simulator reaches the last lap', () => {
    vi.useFakeTimers();
    const allDrivers = Object.fromEntries(grid.drivers.map((driver) => [driver.id, driver]));
    const allTeams = Object.fromEntries(grid.teams.map((team) => [team.id, team]));
    const { result } = renderHook(() => {
      const race = useRaceSimulation({ intervalMs: 1000 });
      return useResultsPresentation({
        rows: race.state.rows,
        mode: 'leader',
        finished: race.finished,
        drivers: allDrivers,
        teams: allTeams,
      });
    });

    expect(result.current.mode).toBe('leader');
    act(() => void vi.advanceTimersByTime(70_000));
    expect(result.current.mode).toBe('results');
    expect(result.current.podium).not.toBeNull();
  });
});
