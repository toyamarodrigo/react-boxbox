import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRaceSimulation } from './use-race-simulation';

afterEach(() => vi.useRealTimers());

it('ticks, pauses, resets, and clears its timer', () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useRaceSimulation({ intervalMs: 100, seed: 5 }));
  expect(result.current.state.lap).toBe(0);
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.state.lap).toBe(2);
  act(() => result.current.pause());
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.state.lap).toBe(2);
  act(() => result.current.play());
  act(() => vi.advanceTimersByTime(100));
  expect(result.current.state.lap).toBe(3);
  act(() => result.current.reset());
  expect(result.current.state.lap).toBe(0);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
