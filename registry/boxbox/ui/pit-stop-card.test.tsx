import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import {
  PitStopCard,
  formatLaneTime,
  formatPitPosition,
  pitStopCardLabel,
} from '@/registry/boxbox/ui/pit-stop-card';

const card = () => document.querySelector('[data-slot="pit-stop-card"]');
const part = (slot: string) => document.querySelector(`[data-slot="pit-stop-card-${slot}"]`);

const stop = {
  code: 'EVO',
  stop: 2,
  laneTime: 22.4,
  compoundOff: 'M',
  compoundOn: 'H',
  positionIn: 3,
  positionOut: 5,
} as const;

describe('formatLaneTime', () => {
  it('shows seconds with one decimal', () => {
    expect(formatLaneTime(22.4)).toBe('22.4');
    expect(formatLaneTime(22.46)).toBe('22.5');
    expect(formatLaneTime(9)).toBe('9.0');
  });

  it('never runs below zero, and shows a dash for no figure', () => {
    expect(formatLaneTime(-0.2)).toBe('0.0');
    expect(formatLaneTime(Number.NaN)).toBe('—');
  });
});

describe('formatPitPosition', () => {
  it('prints a position as the board does, and a dash when it is not known', () => {
    expect(formatPitPosition(3)).toBe('P3');
    expect(formatPitPosition(undefined)).toBe('—');
  });
});

describe('pitStopCardLabel', () => {
  it('reads the whole stop in one sentence', () => {
    expect(pitStopCardLabel(stop)).toBe(
      'EVO pit stop 2, medium tyres off, hard on, pit lane 22.4 seconds, in P3, out P5.',
    );
  });

  it('leaves the tyres out when either compound is unknown', () => {
    expect(pitStopCardLabel({ ...stop, compoundOn: undefined })).toBe(
      'EVO pit stop 2, pit lane 22.4 seconds, in P3, out P5.',
    );
  });

  it('leaves the position out while the car is still in the lane', () => {
    expect(pitStopCardLabel({ ...stop, laneTime: 12.3, positionOut: undefined })).toBe(
      'EVO pit stop 2, medium tyres off, hard on, pit lane 12.3 seconds, in P3.',
    );
  });

  it('never calls the time stationary', () => {
    expect(pitStopCardLabel(stop)).not.toMatch(/stationary/i);
  });
});

describe('PitStopCard', () => {
  it('paints the car, the stop, the tyre change, the lane time and the positions', () => {
    render(<PitStopCard {...stop} color="#C78B46" />);
    expect(card()).toHaveAttribute('data-stop', '2');
    expect(card()).toHaveAttribute('data-out', 'true');
    expect(part('plate')).toHaveTextContent('EVO');
    expect(part('stop')).toHaveTextContent('STOP 2');
    expect(part('color')).toHaveStyle({ backgroundColor: '#C78B46' });
    expect(part('lane')).toHaveTextContent('PIT LANE');
    expect(part('lane-time')).toHaveTextContent('22.4');
    const badges = [...document.querySelectorAll('[data-slot="tyre-badge"]')];
    expect(badges.map((badge) => badge.getAttribute('data-compound'))).toEqual(['M', 'H']);
    expect(part('position-in')).toHaveTextContent('P3');
    expect(part('position-out')).toHaveTextContent('P5');
  });

  it('drops the tyre pair when either compound is unknown', () => {
    render(<PitStopCard {...stop} compoundOff={undefined} />);
    expect(part('tyres')).toBeNull();
    expect(document.querySelector('[data-slot="tyre-badge"]')).toBeNull();
    expect(part('lane-time')).toHaveTextContent('22.4');
  });

  it('keeps the position out empty until the car leaves, then shows it', () => {
    const { rerender } = render(<PitStopCard {...stop} laneTime={8.1} positionOut={undefined} />);
    expect(card()).toHaveAttribute('data-out', 'false');
    expect(part('position-out')).toBeNull();
    expect(part('lane-time')).toHaveTextContent('8.1');

    rerender(<PitStopCard {...stop} />);
    expect(card()).toHaveAttribute('data-out', 'true');
    expect(part('position-out')).toHaveTextContent('P5');
    expect(part('lane-time')).toHaveTextContent('22.4');
  });

  it('reads one sentence and hides everything painted', () => {
    render(<PitStopCard {...stop} />);
    expect(
      screen.getByText(
        'EVO pit stop 2, medium tyres off, hard on, pit lane 22.4 seconds, in P3, out P5.',
      ),
    ).toHaveClass('sr-only');
    for (const slot of ['plate', 'lane', 'positions']) {
      expect(part(slot)).toHaveAttribute('aria-hidden');
    }
  });

  it('keeps every figure under reduced motion, and leaves at once', async () => {
    const { rerender } = render(
      <MotionConfig reducedMotion="always">
        <AnimatePresence>
          <PitStopCard key="stop" {...stop} size="sm" positionOut={undefined} />
        </AnimatePresence>
      </MotionConfig>,
    );
    expect(card()).toHaveAttribute('data-size', 'sm');
    // No wipe: the card is fully drawn from its first frame.
    expect((card() as HTMLElement).style.clipPath).not.toBe('inset(0 100% 0 0)');

    rerender(
      <MotionConfig reducedMotion="always">
        <AnimatePresence>
          <PitStopCard key="stop" {...stop} size="sm" />
        </AnimatePresence>
      </MotionConfig>,
    );
    expect(part('position-out')).toHaveTextContent('P5');
    expect((part('position-out') as HTMLElement).style.opacity).not.toBe('0');

    rerender(
      <MotionConfig reducedMotion="always">
        <AnimatePresence>{null}</AnimatePresence>
      </MotionConfig>,
    );
    await waitFor(() => expect(card()).toBeNull());
  });

  it('wipes in from the left when it mounts', () => {
    render(<PitStopCard {...stop} />);
    expect((card() as HTMLElement).style.clipPath).toBe('inset(0 100% 0 0)');
  });
});
