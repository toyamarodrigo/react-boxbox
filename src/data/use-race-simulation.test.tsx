import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRaceSimulation } from './use-race-simulation';

afterEach(() => vi.useRealTimers());

it('ticks, pauses, resets, and clears its timer', () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useRaceSimulation({ intervalMs: 100, seed: 5 }));
  expect(result.current.state.lap).toBe(0);
  expect(result.current.state.elapsedMs).toBe(0);
  act(() => vi.advanceTimersByTime(100));
  const firstLapMs = result.current.state.elapsedMs;
  expect(firstLapMs).toBeGreaterThan(0);
  act(() => vi.advanceTimersByTime(100));
  expect(result.current.state.lap).toBe(2);
  expect(result.current.state.elapsedMs).toBeGreaterThan(firstLapMs);
  act(() => result.current.pause());
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.state.lap).toBe(2);
  act(() => result.current.play());
  act(() => vi.advanceTimersByTime(100));
  expect(result.current.state.lap).toBe(3);
  act(() => result.current.reset());
  expect(result.current.state.lap).toBe(0);
  expect(result.current.state.elapsedMs).toBe(0);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('stops its timer at the chequered flag and resumes after reset', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRaceSimulation({ intervalMs: 10, seed: 9 }));
  const total = result.current.state.totalLaps;
  act(() => vi.advanceTimersByTime(total * 10 + 50));
  expect(result.current.state.lap).toBe(total);
  expect(result.current.finished).toBe(true);
  expect(result.current.isPlaying).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  act(() => result.current.reset());
  expect(result.current.state.lap).toBe(0);
  expect(result.current.isPlaying).toBe(true);
  act(() => vi.advanceTimersByTime(10));
  expect(result.current.state.lap).toBe(1);
});
