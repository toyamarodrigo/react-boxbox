import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayBumper, replayBumperTimeline } from './replay-bumper';

describe('replayBumperTimeline', () => {
  it('splits a run into cover, midpoint, and uncover phases', () => {
    expect(replayBumperTimeline(1200)).toEqual({ cover: 480, midpoint: 600, uncover: 720 });
    const timeline = replayBumperTimeline(2000);
    expect(timeline.cover).toBeLessThan(timeline.midpoint);
    expect(timeline.midpoint).toBeLessThan(timeline.uncover);
    expect(timeline.uncover).toBeLessThan(2000);
  });
});

describe('ReplayBumper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function setup(props: Partial<Parameters<typeof ReplayBumper>[0]> = {}) {
    const onMidpoint = vi.fn();
    const onComplete = vi.fn();
    const view = render(
      <ReplayBumper
        play={false}
        duration={1000}
        onMidpoint={onMidpoint}
        onComplete={onComplete}
        {...props}
      >
        <p>camera feed</p>
      </ReplayBumper>,
    );
    const rerender = (next: Partial<Parameters<typeof ReplayBumper>[0]>) =>
      view.rerender(
        <ReplayBumper
          play={false}
          duration={1000}
          onMidpoint={onMidpoint}
          onComplete={onComplete}
          {...props}
          {...next}
        >
          <p>camera feed</p>
        </ReplayBumper>,
      );
    return { ...view, rerender, onMidpoint, onComplete };
  }

  const root = () => document.querySelector('[data-slot="replay-bumper"]');

  it('runs once on a rising edge of play and keeps rendering its children', () => {
    const { rerender, onMidpoint, onComplete } = setup();
    expect(screen.getByText('camera feed')).toBeInTheDocument();
    expect(root()).toHaveAttribute('data-playing', 'false');

    act(() => rerender({ play: true }));
    expect(root()).toHaveAttribute('data-playing', 'true');
    expect(screen.getAllByText('REPLAY').length).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(500));
    expect(onMidpoint).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(root()).toHaveAttribute('data-playing', 'false');
    expect(screen.getByText('camera feed')).toBeInTheDocument();
  });

  it('does not re-trigger while play stays true, and runs again on the next rising edge', () => {
    const { rerender, onMidpoint, onComplete } = setup();
    act(() => rerender({ play: true }));
    act(() => vi.advanceTimersByTime(1000));
    act(() => rerender({ play: true }));
    act(() => vi.advanceTimersByTime(1000));
    expect(onMidpoint).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => rerender({ play: false }));
    act(() => rerender({ play: true }));
    act(() => vi.advanceTimersByTime(1000));
    expect(onMidpoint).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('completes the run even when play flips back to false mid-run', () => {
    const { rerender, onMidpoint, onComplete } = setup();
    act(() => rerender({ play: true }));
    act(() => vi.advanceTimersByTime(200));
    act(() => rerender({ play: false }));
    act(() => vi.advanceTimersByTime(800));
    expect(onMidpoint).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fires nothing more after unmounting mid-run', () => {
    const { rerender, unmount, onMidpoint, onComplete } = setup();
    act(() => rerender({ play: true }));
    act(() => vi.advanceTimersByTime(200));
    unmount();
    act(() => vi.advanceTimersByTime(2000));
    expect(onMidpoint).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('announces a custom label while playing', () => {
    const { rerender } = setup({ label: 'ACTION' });
    act(() => rerender({ play: true }));
    expect(screen.getByRole('status')).toHaveTextContent('ACTION');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it.each(['wipe', 'slide', 'flash'] as const)(
    'exposes the %s variant on both slots',
    (variant) => {
      const { rerender } = setup({ variant });
      expect(root()).toHaveAttribute('data-variant', variant);
      act(() => rerender({ play: true }));
      expect(document.querySelector('[data-slot="replay-bumper-overlay"]')).toHaveAttribute(
        'data-variant',
        variant,
      );
    },
  );
});
