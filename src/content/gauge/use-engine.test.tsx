import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng } from '@/data/simulation';
import { ENGINE_GEARS, ENGINE_IDLE, ENGINE_SHIFT_UP, advanceEngine, useEngine } from './use-engine';

afterEach(() => vi.useRealTimers());

const run = (ticks: number, seed = 7) => {
  let engine = { rpm: ENGINE_IDLE, gear: 1, throttle: 1 };
  const trace = [engine];
  for (let tick = 0; tick < ticks; tick++) {
    engine = advanceEngine(engine, createSeededRng(seed + tick * 0x9e3779b9));
    trace.push(engine);
  }
  return trace;
};

describe('advanceEngine', () => {
  it('climbs through the gears and never runs past the limiter', () => {
    const trace = run(400);
    expect(Math.max(...trace.map((step) => step.gear))).toBe(ENGINE_GEARS);
    expect(Math.max(...trace.map((step) => step.rpm))).toBeLessThanOrEqual(ENGINE_SHIFT_UP + 200);
    expect(Math.min(...trace.map((step) => step.rpm))).toBeGreaterThanOrEqual(ENGINE_IDLE);
  });

  it('drops the revolutions on the upshift and comes back down through the box', () => {
    const trace = run(400);
    const upshifts = trace.filter((step, index) => index > 0 && step.gear > trace[index - 1]!.gear);
    const downshifts = trace.filter(
      (step, index) => index > 0 && step.gear < trace[index - 1]!.gear,
    );
    expect(upshifts.length).toBeGreaterThan(3);
    expect(downshifts.length).toBeGreaterThan(3);
    for (const [index, step] of trace.entries()) {
      if (index > 0 && step.gear > trace[index - 1]!.gear) {
        expect(step.rpm).toBeLessThan(trace[index - 1]!.rpm);
      }
    }
  });

  it('is the same lap for the same seed and a different one for another', () => {
    expect(run(120)).toEqual(run(120));
    expect(run(120)).not.toEqual(run(120, 99));
  });
});

describe('useEngine', () => {
  it('advances the engine on its own interval', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEngine({ intervalMs: 50 }));

    expect(result.current).toEqual({ rpm: ENGINE_IDLE, gear: 1, throttle: 1 });
    act(() => vi.advanceTimersByTime(50));
    expect(result.current.rpm).toBeGreaterThan(ENGINE_IDLE);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.gear).toBeGreaterThan(1);
  });

  it('holds the reading while it is not running', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEngine({ intervalMs: 50, running: false }));

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toEqual({ rpm: ENGINE_IDLE, gear: 1, throttle: 1 });
  });

  it('runs the same engine for the same seed', () => {
    vi.useFakeTimers();
    const first = renderHook(() => useEngine({ intervalMs: 50, seed: 3 }));
    const second = renderHook(() => useEngine({ intervalMs: 50, seed: 3 }));
    act(() => vi.advanceTimersByTime(1500));

    expect(second.result.current).toEqual(first.result.current);
    expect(second.result.current).toEqual(run(30, 3).at(-1));
  });
});
