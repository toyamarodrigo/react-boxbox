import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';

import type { SectorTime } from '@/registry/boxbox/lib/types';
import { SectorTimes, formatLapTime, formatSectorTime } from './sector-times';

const sectors: [SectorTime, SectorTime, SectorTime] = [
  { time: 28.914, status: 'personal' },
  { time: 31.207, status: 'fastest' },
  { time: null, status: 'unset' },
];

describe('formatSectorTime', () => {
  it('always prints three decimals and an em dash for no time', () => {
    expect(formatSectorTime(30.512)).toBe('30.512');
    expect(formatSectorTime(29)).toBe('29.000');
    expect(formatSectorTime(9.007)).toBe('9.007');
    expect(formatSectorTime(128.5)).toBe('128.500');
    expect(formatSectorTime(null)).toBe('—');
  });
});

describe('formatLapTime', () => {
  it('formats minutes without a leading zero and pads seconds and millis', () => {
    expect(formatLapTime(91.512)).toBe('1:31.512');
    expect(formatLapTime(65.007)).toBe('1:05.007');
    expect(formatLapTime(59.999)).toBe('59.999');
    expect(formatLapTime(60)).toBe('1:00.000');
    expect(formatLapTime(0)).toBe('0.000');
    expect(formatLapTime(3661.25)).toBe('61:01.250');
    expect(formatLapTime(null)).toBe('—');
  });
});

describe('SectorTimes', () => {
  it('renders three sectors with their statuses and an em dash when unset', () => {
    const { container } = render(<SectorTimes sectors={sectors} lapTime={91.512} />);
    const view = within(container);
    const rendered = container.querySelectorAll('[data-slot="sector-times-sector"]');
    expect(rendered).toHaveLength(3);
    expect([...rendered].map((node) => node.getAttribute('data-status'))).toEqual([
      'personal',
      'fastest',
      'unset',
    ]);
    expect(view.getByRole('group', { name: 'Sector times' })).toHaveAttribute('data-layout', 'row');
    expect(view.getByText('28.914')).toBeInTheDocument();
    expect(view.getByText('—')).toBeInTheDocument();
    expect(view.getByText('1:31.512')).toBeInTheDocument();
  });

  it('supports the stack layout and a lap status', () => {
    const { container } = render(
      <SectorTimes sectors={sectors} layout="stack" lapTime={85.4} lapStatus="fastest" />,
    );
    const view = within(container);
    expect(view.getByRole('group', { name: 'Sector times' })).toHaveAttribute(
      'data-layout',
      'stack',
    );
    expect(container.querySelector('[data-slot="sector-times-lap"]')).toHaveAttribute(
      'data-status',
      'fastest',
    );
    expect(view.getByText('1:25.400')).toBeInTheDocument();
  });

  it('splits every sector bar into mini sectors', () => {
    const { container } = render(<SectorTimes sectors={sectors} miniSectors={4} />);
    expect(
      container.querySelectorAll('[data-slot="sector-times-sector"] [aria-hidden] > div'),
    ).toHaveLength(12);
  });
});
