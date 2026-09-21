import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { SectorTime } from '@/registry/boxbox/lib/types';
import { useProgressiveLap } from './use-progressive-lap';

afterEach(() => vi.useRealTimers());

const lapOne: [SectorTime, SectorTime, SectorTime] = [
  { time: 28.914, status: 'personal' },
  { time: 31.207, status: 'fastest' },
  { time: 29.633, status: 'slower' },
];

const lapTwo: [SectorTime, SectorTime, SectorTime] = [
  { time: 28.5, status: 'fastest' },
  { time: 31.0, status: 'personal' },
  { time: 29.4, status: 'personal' },
];

it('reveals S1, then S2, then S3 with the lap time', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() =>
    useProgressiveLap({ sectors: lapOne, lapTime: 89.754, lapStatus: 'fastest', intervalMs: 1500 }),
  );

  expect(result.current.sectors.map((sector) => sector.status)).toEqual([
    'personal',
    'unset',
    'unset',
  ]);
  expect(result.current.lapTime).toBeNull();

  act(() => vi.advanceTimersByTime(500));
  expect(result.current.sectors.map((sector) => sector.status)).toEqual([
    'personal',
    'fastest',
    'unset',
  ]);
  expect(result.current.lapTime).toBeNull();

  act(() => vi.advanceTimersByTime(500));
  expect(result.current.sectors.map((sector) => sector.time)).toEqual([28.914, 31.207, 29.633]);
  expect(result.current.lapTime).toBe(89.754);
  expect(result.current.lapStatus).toBe('fastest');
});

it('restarts the reveal on a new lap and holds the previous lap time meanwhile', () => {
  vi.useFakeTimers();
  const { result, rerender, unmount } = renderHook(
    (props: { sectors: [SectorTime, SectorTime, SectorTime]; lapTime: number }) =>
      useProgressiveLap({ ...props, lapStatus: 'personal', intervalMs: 1500 }),
    { initialProps: { sectors: lapOne, lapTime: 89.754 } },
  );

  act(() => vi.advanceTimersByTime(1500));
  expect(result.current.lapTime).toBe(89.754);

  rerender({ sectors: lapTwo, lapTime: 88.9 });
  act(() => vi.advanceTimersByTime(0));
  expect(result.current.sectors.map((sector) => sector.status)).toEqual([
    'fastest',
    'unset',
    'unset',
  ]);
  expect(result.current.lapTime).toBe(89.754);

  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.sectors.map((sector) => sector.time)).toEqual([28.5, 31.0, 29.4]);
  expect(result.current.lapTime).toBe(88.9);

  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
