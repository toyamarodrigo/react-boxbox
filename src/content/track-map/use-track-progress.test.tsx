import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useTrackProgress } from './use-track-progress';

afterEach(() => vi.useRealTimers());

it('spreads the field round the lap before it moves', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTrackProgress(4, 200));

  expect(result.current).toHaveLength(4);
  expect(new Set(result.current).size).toBe(4);
  for (const value of result.current) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
});

it('advances every car on each tick, each at its own speed', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTrackProgress(3, 200));
  const start = [...result.current];

  act(() => vi.advanceTimersByTime(200));
  const steps = result.current.map((value, index) => value - start[index]!);
  for (const step of steps) expect(step).toBeGreaterThan(0);
  expect(new Set(steps.map((step) => step.toFixed(4))).size).toBeGreaterThan(1);

  act(() => vi.advanceTimersByTime(200));
  for (const [index, value] of result.current.entries()) {
    expect(value).toBeCloseTo(start[index]! + steps[index]! * 2, 6);
  }
});

it('wraps a car back past the start line instead of going over 1', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTrackProgress(1, 100));

  // One lap at the slowest speed takes well under 200 ticks.
  act(() => vi.advanceTimersByTime(100 * 200));
  for (const value of result.current) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }

  let crossed = false;
  for (let tick = 0; tick < 80; tick += 1) {
    const before = result.current[0]!;
    act(() => vi.advanceTimersByTime(100));
    if (result.current[0]! < before) crossed = true;
  }
  expect(crossed).toBe(true);
});

it('restarts the field when the car count changes', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ count }) => useTrackProgress(count, 200), {
    initialProps: { count: 2 },
  });

  act(() => vi.advanceTimersByTime(600));
  expect(result.current[0]).toBeGreaterThan(0);

  rerender({ count: 5 });
  expect(result.current).toHaveLength(5);
  expect(result.current[0]).toBe(0);
});

it('stands still while it is disabled', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTrackProgress(3, 200, false));
  const start = [...result.current];

  act(() => vi.advanceTimersByTime(2000));
  expect(result.current).toEqual(start);
});
