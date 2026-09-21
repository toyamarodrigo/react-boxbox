import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrackStatus } from '@/registry/boxbox/lib/types';
import { FLAG_BANNER_LABELS, FlagBanner, flagBannerLabel } from '@/registry/boxbox/ui/flag-banner';

const statuses = Object.keys(FLAG_BANNER_LABELS) as TrackStatus[];

describe('flagBannerLabel', () => {
  it.each([
    ['green', undefined, 'TRACK CLEAR'],
    ['yellow', undefined, 'YELLOW FLAG'],
    ['yellow', 2, 'YELLOW FLAG · SECTOR 2'],
    ['double-yellow', undefined, 'DOUBLE YELLOW'],
    ['double-yellow', 1, 'DOUBLE YELLOW · SECTOR 1'],
    ['red', undefined, 'RED FLAG'],
    ['sc', undefined, 'SAFETY CAR'],
    ['vsc', undefined, 'VIRTUAL SAFETY CAR'],
    ['chequered', undefined, 'CHEQUERED FLAG'],
  ] as [TrackStatus, number | undefined, string][])(
    'labels %s in sector %s',
    (status, sector, expected) => {
      expect(flagBannerLabel(status, sector)).toBe(expected);
    },
  );
});

describe('FlagBanner', () => {
  it('shows the label of every track status and records it on the root', () => {
    for (const status of statuses) {
      const { container, unmount } = render(<FlagBanner status={status} />);
      const banner = container.querySelector('[data-slot="flag-banner"]');
      expect(banner).toHaveAttribute('data-status', status);
      expect(banner).toHaveAttribute('data-align', 'left');
      expect(banner).toHaveAttribute('data-size', 'md');
      expect(container.querySelector('[data-slot="flag-banner-label"]')).toHaveTextContent(
        FLAG_BANNER_LABELS[status],
      );
      unmount();
    }
  });

  it('appends the sector to the label', () => {
    const { container } = render(<FlagBanner status="yellow" sector={2} />);
    expect(container.querySelector('[data-slot="flag-banner-label"]')).toHaveTextContent(
      'YELLOW FLAG · SECTOR 2',
    );
  });

  it('renders a message as its own part', () => {
    const { container } = render(<FlagBanner status="red" message="Session suspended" />);
    expect(container.querySelector('[data-slot="flag-banner-message"]')).toHaveTextContent(
      'Session suspended',
    );
  });

  it('speaks the status and the message once, and hides the painted text', () => {
    render(<FlagBanner status="sc" sector={3} message="Car stopped at turn 9" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Track status: SAFETY CAR · SECTOR 3. Car stopped at turn 9.');
    expect(banner.querySelector('[data-slot="flag-banner-label"]')).toHaveAttribute('aria-hidden');
    expect(banner.querySelector('[data-slot="flag-banner-message"]')).toHaveAttribute(
      'aria-hidden',
    );
  });

  it('interrupts for a status the viewer must act on and waits for the rest', () => {
    const { container, rerender } = render(<FlagBanner status="green" />);
    const banner = () => container.querySelector('[data-slot="flag-banner"]');
    expect(banner()).toHaveAttribute('aria-live', 'polite');
    for (const status of ['double-yellow', 'red', 'sc', 'vsc'] as TrackStatus[]) {
      rerender(<FlagBanner status={status} />);
      expect(banner()).toHaveAttribute('aria-live', 'assertive');
    }
    rerender(<FlagBanner status="chequered" />);
    expect(banner()).toHaveAttribute('aria-live', 'polite');
  });

  it('carries the align and size settings on the root', () => {
    const { container } = render(<FlagBanner status="yellow" align="center" size="lg" />);
    const banner = container.querySelector('[data-slot="flag-banner"]');
    expect(banner).toHaveAttribute('data-align', 'center');
    expect(banner).toHaveAttribute('data-size', 'lg');
  });

  it('renders no banner when it starts hidden', () => {
    const { container } = render(<FlagBanner status="red" visible={false} />);
    expect(container.querySelector('[data-slot="flag-banner"]')).toBeNull();
    expect(screen.queryByText('RED FLAG')).not.toBeInTheDocument();
  });
});
