import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useRaceLap } from './use-race-lap';

afterEach(() => vi.useRealTimers());

it('starts on the grid and counts a lap per tick', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRaceLap(10, 200));

  expect(result.current).toBe(0);
  act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(1);
  act(() => vi.advanceTimersByTime(600));
  expect(result.current).toBe(4);
});

it('starts the race again at the flag', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRaceLap(3, 100));

  act(() => vi.advanceTimersByTime(300));
  expect(result.current).toBe(3);
  act(() => vi.advanceTimersByTime(100));
  expect(result.current).toBe(0);
});

it('goes back to the grid when the distance changes', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ laps }) => useRaceLap(laps, 100), {
    initialProps: { laps: 10 },
  });

  act(() => vi.advanceTimersByTime(300));
  expect(result.current).toBe(3);

  rerender({ laps: 20 });
  expect(result.current).toBe(0);
});

it('holds the lap while it is disabled', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRaceLap(10, 100, false));

  act(() => vi.advanceTimersByTime(2000));
  expect(result.current).toBe(0);
});
