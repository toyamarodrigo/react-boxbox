import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testReplayRace } from './replay-fixtures';
import { useRaceReplay } from './use-race-replay';

const race = testReplayRace();

afterEach(() => vi.useRealTimers());

describe('useRaceReplay', () => {
  it('starts on lap one, paused, with the first lap on the tower', () => {
    const { result } = renderHook(() => useRaceReplay(race));
    expect(result.current.lap).toBe(1);
    expect(result.current.totalLaps).toBe(3);
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.finished).toBe(false);
    expect(result.current.rows.map((row) => row.driverId)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);
  });

  it('advances the clock at one hundred milliseconds a tick and changes lap on the leader', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useRaceReplay(race, { autoPlay: true }));
    expect(result.current.isPlaying).toBe(true);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.elapsedMs).toBe(1000);
    expect(result.current.lap).toBe(1);

    // The leader completes lap one at 100000ms.
    act(() => vi.advanceTimersByTime(99_000));
    expect(result.current.elapsedMs).toBe(100_000);
    expect(result.current.lap).toBe(2);
    expect(result.current.rows.map((row) => row.driverId)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('multiplies the clock by the speed', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRaceReplay(race, { autoPlay: true, speed: 20 }));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.elapsedMs).toBe(20_000);

    act(() => result.current.setSpeed(5));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.elapsedMs).toBe(25_000);
    expect(result.current.speed).toBe(5);
  });

  it('pauses and plays again', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRaceReplay(race, { autoPlay: true }));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.elapsedMs).toBe(500);
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.elapsedMs).toBe(1000);
  });

  it('finishes at the chequered flag, stops its timer and shows the classification', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRaceReplay(race, { autoPlay: true, speed: 20 }));
    act(() => vi.advanceTimersByTime(20_000));

    expect(result.current.elapsedMs).toBe(297_000);
    expect(result.current.finished).toBe(true);
    expect(result.current.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.lap).toBe(3);
    expect(result.current.markers).toEqual([]);
    expect(result.current.rows.map((row) => row.driverId)).toEqual([
      'bravo',
      'alpha',
      'charlie',
      'delta',
    ]);
    expect(result.current.rows[0]?.points).toBe(25);
    expect(result.current.rows.at(-1)?.finishStatus).toBe('dnf');
  });

  it('seeks by lap and steps forward and back', () => {
    const { result } = renderHook(() => useRaceReplay(race));
    act(() => result.current.setLap(3));
    expect(result.current.elapsedMs).toBe(199_000);
    expect(result.current.lap).toBe(3);

    act(() => result.current.previousLap());
    expect(result.current.elapsedMs).toBe(100_000);
    expect(result.current.lap).toBe(2);

    act(() => result.current.nextLap());
    expect(result.current.lap).toBe(3);

    // Seeking is clamped to the race.
    act(() => result.current.setLap(99));
    expect(result.current.lap).toBe(3);
    act(() => result.current.setLap(0));
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.lap).toBe(1);
  });

  it('seeks to any race time, clamped to the race, and reports the jump for one render', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRaceReplay(race, { autoPlay: true }));
    expect(result.current.endMs).toBe(297_000);
    expect(result.current.lapBoundaries).toEqual([0, 100_000, 199_000, 297_000]);
    expect(result.current.jumped).toBe(false);

    act(() => result.current.seek(150_000));
    expect(result.current.elapsedMs).toBe(150_000);
    expect(result.current.lap).toBe(2);
    expect(result.current.jumped).toBe(true);

    // The next tick moves the clock normally again.
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.elapsedMs).toBe(150_100);
    expect(result.current.jumped).toBe(false);

    act(() => result.current.seek(-5));
    expect(result.current.elapsedMs).toBe(0);
    act(() => result.current.seek(9_999_999));
    expect(result.current.elapsedMs).toBe(297_000);
    expect(result.current.finished).toBe(true);

    // Seeking back from the flag makes the replay playable again.
    act(() => result.current.seek(200_000));
    expect(result.current.finished).toBe(false);
    expect(result.current.isPlaying).toBe(true);
  });

  it('restarts back to the start line and pauses', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRaceReplay(race, { autoPlay: true, speed: 20 }));
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.finished).toBe(true);

    act(() => result.current.restart());
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.finished).toBe(false);
    expect(result.current.isPlaying).toBe(true);
  });

  it('puts a marker on the track for each running car, each on its own lap', () => {
    const { result } = renderHook(() => useRaceReplay(race));
    act(() => result.current.setLap(3));
    // The leader starts lap three at 199000; delta is still out on its lap two until 326000.
    expect(result.current.markers.map((marker) => marker.id)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);
    expect(result.current.markers.map((marker) => marker.emphasis)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(result.current.markers[0]?.progress).toBeCloseTo(0.99);
    expect(result.current.markers[1]?.progress).toBe(0);
  });

  it('rewinds when the race changes', () => {
    const { result, rerender } = renderHook(({ value }) => useRaceReplay(value), {
      initialProps: { value: race as ReturnType<typeof testReplayRace> | undefined },
    });
    act(() => result.current.setLap(3));
    expect(result.current.elapsedMs).toBe(199_000);

    rerender({ value: { ...race, id: '2030-2' } });
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.lap).toBe(1);
  });

  it('is inert without a race', () => {
    const { result } = renderHook(() => useRaceReplay(undefined, { autoPlay: true }));
    expect(result.current.totalLaps).toBe(0);
    expect(result.current.rows).toEqual([]);
    expect(result.current.markers).toEqual([]);
    expect(result.current.finished).toBe(false);
    expect(result.current.isPlaying).toBe(false);
  });
});
