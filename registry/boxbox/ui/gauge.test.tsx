import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import {
  GAUGE_SWEEP,
  Gauge,
  formatGear,
  formatRpm,
  gaugeArc,
  gaugeFraction,
  gaugeLabel,
} from '@/registry/boxbox/ui/gauge';

const gauge = () => document.querySelector('[data-slot="gauge"]');

describe('gaugeFraction', () => {
  it('is the share of the scale, clamped at both ends', () => {
    expect(gaugeFraction(7500, 15_000)).toBe(0.5);
    expect(gaugeFraction(0, 15_000)).toBe(0);
    expect(gaugeFraction(20_000, 15_000)).toBe(1);
    expect(gaugeFraction(-500, 15_000)).toBe(0);
  });

  it('is zero for a scale that cannot be divided by', () => {
    expect(gaugeFraction(7500, 0)).toBe(0);
    expect(gaugeFraction(7500, -1)).toBe(0);
    expect(gaugeFraction(Number.NaN, 15_000)).toBe(0);
  });
});

describe('gaugeArc', () => {
  const full = gaugeArc(1);
  const empty = gaugeArc(0);

  it('covers the sweep of the circle and nothing more', () => {
    const circumference = 2 * Math.PI * 42;
    expect(full.length).toBeCloseTo((circumference * GAUGE_SWEEP) / 360, 6);
    expect(full.dasharray).toBe(`${full.length} ${circumference}`);
  });

  it('empties the arc from its end, so one number animates', () => {
    expect(empty.dashoffset).toBeCloseTo(full.length, 6);
    expect(full.dashoffset).toBe(0);
    expect(gaugeArc(0.5).dashoffset).toBeCloseTo(full.length / 2, 6);
  });

  it('turns the circle until its start sits at the left end of the arc', () => {
    expect(full.rotation).toBe(150);
    expect(gaugeArc(1, 360).rotation).toBe(90);
    expect(gaugeArc(1, 180).length).toBeCloseTo(Math.PI * 42, 6);
  });

  it('clamps a fraction and a sweep outside their range', () => {
    expect(gaugeArc(2).dashoffset).toBe(0);
    expect(gaugeArc(-1).dashoffset).toBeCloseTo(full.length, 6);
    expect(gaugeArc(1, 400).rotation).toBe(90);
  });
});

describe('formatGear and formatRpm', () => {
  it('paints neutral, reverse, nothing known, and whole gears', () => {
    expect(formatGear(6)).toBe('6');
    expect(formatGear(0)).toBe('N');
    expect(formatGear('N')).toBe('N');
    expect(formatGear('R')).toBe('R');
    expect(formatGear(null)).toBe('–');
  });

  it('separates thousands the same way everywhere', () => {
    expect(formatRpm(11_200)).toBe('11,200');
    expect(formatRpm(980.6)).toBe('981');
  });
});

describe('gaugeLabel', () => {
  it('reads the gear and the revolutions, and calls the redline', () => {
    expect(gaugeLabel(11_200, 6)).toBe('Gear 6, 11,200 rpm');
    expect(gaugeLabel(12_400, 8)).toBe('Gear 8, 12,400 rpm, redline');
    expect(gaugeLabel(12_000, 8, 12_000)).toBe('Gear 8, 12,000 rpm, redline');
    expect(gaugeLabel(4_000, null)).toBe('No gear, 4,000 rpm');
    expect(gaugeLabel(4_000, 'R')).toBe('Gear R, 4,000 rpm');
  });
});

describe('Gauge', () => {
  it('paints the gear, hides the drawing, and speaks one sentence', () => {
    render(<Gauge value={11_200} gear={6} />);
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Gear 6, 11,200 rpm')).toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden');
    expect(gauge()).toHaveAttribute('data-gear', '6');
    expect(gauge()).not.toHaveAttribute('data-redline');
  });

  it('flags the redline and colours the arc with it', () => {
    render(<Gauge value={12_500} gear={8} redline={12_000} />);
    expect(gauge()).toHaveAttribute('data-redline', 'true');
    expect(document.querySelectorAll('circle')[1]).toHaveStyle({ stroke: 'var(--destructive)' });
    expect(screen.getByText('Gear 8, 12,500 rpm, redline')).toBeInTheDocument();
  });

  it('shows the revolutions under the gear only when asked', () => {
    const { rerender } = render(<Gauge value={9_400} gear={4} />);
    expect(document.querySelector('[data-slot="gauge-value"]')).toBeNull();
    rerender(<Gauge value={9_400} gear={4} showValue size="lg" />);
    expect(document.querySelector('[data-slot="gauge-value"]')).toHaveTextContent('9,400');
    expect(gauge()).toHaveAttribute('data-size', 'lg');
  });

  it('keeps neutral, reverse and no gear as text', () => {
    const { rerender } = render(<Gauge value={0} gear="N" />);
    expect(gauge()).toHaveAttribute('data-gear', 'N');
    rerender(<Gauge value={0} gear={null} />);
    expect(gauge()).toHaveAttribute('data-gear', '–');
    expect(screen.getByText('No gear, 0 rpm')).toBeInTheDocument();
  });

  it('keeps the gear and the redline readable with motion disabled', () => {
    render(
      <MotionConfig reducedMotion="always">
        <Gauge value={12_500} gear={7} showValue />
      </MotionConfig>,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="gauge-value"]')).toHaveTextContent('12,500');
    expect(gauge()).toHaveAttribute('data-redline', 'true');
  });
});
