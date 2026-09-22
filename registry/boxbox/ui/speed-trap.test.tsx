import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import {
  SPEED_UNIT_LABELS,
  SpeedTrap,
  formatSpeed,
  isSessionBest,
  speedTrapLabel,
} from '@/registry/boxbox/ui/speed-trap';

const trap = () => document.querySelector('[data-slot="speed-trap"]');

describe('formatSpeed', () => {
  it('rounds to a whole number and never carries the unit', () => {
    expect(formatSpeed(342.4)).toBe('342');
    expect(formatSpeed(342.6)).toBe('343');
    expect(formatSpeed(342, 'kph')).toBe('342');
  });

  it('converts to mph, since readings are given in km/h', () => {
    expect(formatSpeed(342, 'mph')).toBe('213');
    expect(formatSpeed(100, 'mph')).toBe('62');
  });

  it('shows a dash when there is no reading', () => {
    expect(formatSpeed(null)).toBe('—');
    expect(formatSpeed(undefined)).toBe('—');
    expect(formatSpeed(Number.NaN)).toBe('—');
  });
});

describe('isSessionBest', () => {
  it('counts the reading as the best when it equals it, since the best includes it', () => {
    expect(isSessionBest(345, { code: 'MSO', speed: 345 })).toBe(true);
    expect(isSessionBest(346, { code: 'MSO', speed: 345 })).toBe(true);
    expect(isSessionBest(344, { code: 'MSO', speed: 345 })).toBe(false);
  });

  it('claims nothing without a best, and nothing without a reading', () => {
    expect(isSessionBest(300, null)).toBe(false);
    expect(isSessionBest(300)).toBe(false);
    expect(isSessionBest(null, { code: 'MSO', speed: 345 })).toBe(false);
  });
});

describe('speedTrapLabel', () => {
  it('reads the car, the reading and whose the session best is', () => {
    expect(speedTrapLabel('EVO', 342, 'kph', { code: 'MSO', speed: 345 })).toBe(
      'EVO 342 km/h, session best MSO 345 km/h',
    );
    expect(speedTrapLabel('EVO', 345, 'kph', { code: 'EVO', speed: 345 })).toBe(
      'EVO 345 km/h, new session best',
    );
    expect(speedTrapLabel('EVO', 342, 'mph', null)).toBe('EVO 213 mph');
    expect(speedTrapLabel('EVO', null)).toBe('EVO, no speed trap reading');
  });

  it('spells the units the way the card paints them', () => {
    expect(SPEED_UNIT_LABELS).toEqual({ kph: 'km/h', mph: 'mph' });
  });
});

describe('SpeedTrap', () => {
  it('paints the reading once and speaks one sentence', () => {
    render(<SpeedTrap code="EVO" speed={342} sessionBest={{ code: 'MSO', speed: 345 }} />);
    expect(screen.getByText('342')).toBeInTheDocument();
    expect(screen.getByText('EVO 342 km/h, session best MSO 345 km/h')).toBeInTheDocument();
    expect(trap()).toHaveAttribute('aria-label', 'EVO 342 km/h, session best MSO 345 km/h');
    // The painted parts are hidden, so the sentence is read once and not twice.
    expect(document.querySelector('[data-slot="speed-trap-plate"]')).toHaveAttribute('aria-hidden');
    expect(document.querySelector('[data-slot="speed-trap-reading"]')).toHaveAttribute(
      'aria-hidden',
    );
  });

  it('flags and flashes a reading that is the session best', () => {
    const { rerender } = render(
      <SpeedTrap code="EVO" speed={342} sessionBest={{ code: 'MSO', speed: 345 }} />,
    );
    expect(trap()).not.toHaveAttribute('data-session-best');
    expect(document.querySelector('[data-slot="speed-trap-reading"] .text-primary')).toBeNull();

    rerender(<SpeedTrap code="EVO" speed={347} sessionBest={{ code: 'EVO', speed: 347 }} />);
    expect(trap()).toHaveAttribute('data-session-best', 'true');
    // The flash is the figure in the primary colour, mounted with its own presence boundary.
    expect(
      document.querySelector('[data-slot="speed-trap-reading"] .text-primary'),
    ).toBeInTheDocument();
    expect(screen.getByText('EVO 347 km/h, new session best')).toBeInTheDocument();
  });

  it('drops the best line when there is none, and survives a missing reading', () => {
    render(<SpeedTrap code="TRE" speed={null} />);
    expect(document.querySelector('[data-slot="speed-trap-best"]')).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('TRE, no speed trap reading')).toBeInTheDocument();
  });

  it('wears no record when there is no session best to measure against', () => {
    render(<SpeedTrap code="TRE" speed={340} />);
    expect(trap()).not.toHaveAttribute('data-session-best');
    expect(document.querySelector('[data-slot="speed-trap-reading"] .text-primary')).toBeNull();
    expect(screen.getByText('TRE 340 km/h')).toBeInTheDocument();
  });

  it('converts the whole card to mph and keeps the label and team colour', () => {
    render(
      <SpeedTrap
        code="EVO"
        speed={342}
        unit="mph"
        color="#C78B46"
        label="TRAP 1"
        size="lg"
        sessionBest={{ code: 'MSO', speed: 350 }}
      />,
    );
    expect(screen.getByText('213')).toBeInTheDocument();
    expect(screen.getByText('217')).toBeInTheDocument();
    expect(screen.getByText('TRAP 1')).toBeInTheDocument();
    expect(trap()).toHaveAttribute('data-unit', 'mph');
    expect(trap()).toHaveAttribute('data-size', 'lg');
    expect(document.querySelector('[data-slot="speed-trap-color"]')).toHaveStyle({
      backgroundColor: '#C78B46',
    });
  });

  it('keeps the figure and the record readable with motion disabled', () => {
    render(
      <MotionConfig reducedMotion="always">
        <SpeedTrap code="EVO" speed={347} sessionBest={{ code: 'EVO', speed: 347 }} />
      </MotionConfig>,
    );
    // The figure and the best line both read 347: the card holds the record itself.
    expect(screen.getAllByText('347')).toHaveLength(2);
    expect(trap()).toHaveAttribute('data-session-best', 'true');
    expect(
      document.querySelector('[data-slot="speed-trap-reading"] .text-primary'),
    ).toBeInTheDocument();
  });
});
