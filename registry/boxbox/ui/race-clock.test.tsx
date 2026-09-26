import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RaceClock, formatRaceClock } from '@/registry/boxbox/ui/race-clock';

describe('formatRaceClock', () => {
  it('formats hours, minutes, and seconds', () => {
    expect(formatRaceClock(0)).toBe('0:00:00');
    expect(formatRaceClock(59_999)).toBe('0:00:59');
    expect(formatRaceClock(3_599_999)).toBe('0:59:59');
    expect(formatRaceClock(3_600_000)).toBe('1:00:00');
    expect(formatRaceClock(7_384_000)).toBe('2:03:04');
  });

  it('clamps negative time to zero', () => {
    expect(formatRaceClock(-1)).toBe('0:00:00');
    expect(formatRaceClock(-3_600_000)).toBe('0:00:00');
    expect(formatRaceClock(-1, { showHours: false })).toBe('00:00');
  });

  it('rolls the hours into the minutes when hours are hidden', () => {
    expect(formatRaceClock(0, { showHours: false })).toBe('00:00');
    expect(formatRaceClock(59_999, { showHours: false })).toBe('00:59');
    expect(formatRaceClock(3_599_999, { showHours: false })).toBe('59:59');
    expect(formatRaceClock(3_600_000, { showHours: false })).toBe('60:00');
  });
});

describe('RaceClock', () => {
  it('renders the formatted time, the role, and the counting direction', () => {
    const { container } = render(<RaceClock ms={3_723_000} />);
    const root = container.querySelector('[data-slot="race-clock"]');
    expect(root).toHaveAttribute('role', 'timer');
    expect(root).toHaveAttribute('data-direction', 'down');
    expect(screen.getByText('1:02:03')).toBeInTheDocument();
    expect(screen.getByText('1:02:03 remaining')).toBeInTheDocument();
  });

  it('says elapsed when it counts up', () => {
    const { container } = render(<RaceClock ms={61_000} direction="up" />);
    expect(container.querySelector('[data-slot="race-clock"]')).toHaveAttribute(
      'data-direction',
      'up',
    );
    expect(screen.getByText('0:01:01 elapsed')).toBeInTheDocument();
  });

  it('shows a label only when one is given, and honours showHours', () => {
    const { container, rerender } = render(<RaceClock ms={61_000} showHours={false} />);
    expect(container.querySelector('[data-slot="race-clock-label"]')).toBeNull();
    expect(screen.getByText('01:01')).toBeInTheDocument();
    rerender(<RaceClock ms={61_000} showHours={false} label="TIME" size="sm" className="w-32" />);
    expect(screen.getByText('TIME')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="race-clock"]')).toHaveClass('w-32');
    expect(container.querySelector('[data-slot="race-clock-time"]')).toHaveClass('text-sm');
  });
});
