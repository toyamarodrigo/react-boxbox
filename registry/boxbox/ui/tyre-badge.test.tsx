import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TYRE_COMPOUNDS } from '@/registry/boxbox/lib/types';
import { TYRE_COMPOUND_NAMES, TyreBadge, tyreCompoundName } from '@/registry/boxbox/ui/tyre-badge';

describe('tyreCompoundName', () => {
  it('maps every compound to its theme token name', () => {
    expect(TYRE_COMPOUNDS.map(tyreCompoundName)).toEqual([
      'soft',
      'medium',
      'hard',
      'inter',
      'wet',
    ]);
    expect(Object.keys(TYRE_COMPOUND_NAMES)).toEqual([...TYRE_COMPOUNDS]);
  });
});

describe('TyreBadge', () => {
  it('renders the compound letter, data attribute, and lap count label', () => {
    render(<TyreBadge compound="S" age={12} />);
    const badge = screen.getByRole('img', { name: 'Soft tyre, 12 laps' });
    expect(badge).toHaveAttribute('data-compound', 'S');
    expect(badge).toHaveAttribute('data-slot', 'tyre-badge');
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows NEW instead of the age when the set is fresh', () => {
    render(<TyreBadge compound="H" age={3} isNew />);
    expect(screen.getByRole('img', { name: 'Hard tyre, new' })).toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('uses a singular lap and omits the age part when no age is given', () => {
    const { rerender } = render(<TyreBadge compound="I" age={1} />);
    expect(screen.getByRole('img', { name: 'Intermediate tyre, 1 lap' })).toBeInTheDocument();
    rerender(<TyreBadge compound="W" />);
    expect(screen.getByRole('img', { name: 'Wet tyre' })).toBeInTheDocument();
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('rolls the age number', () => {
    const { container } = render(<TyreBadge compound="S" age={7} />);
    const roller = container.querySelector(
      '[data-slot="tyre-badge-age"] [data-slot="rolling-number"]',
    );
    expect(roller).toHaveTextContent('7');
  });

  it('changes the ring size class with the size prop', () => {
    const { rerender, container } = render(<TyreBadge compound="M" age={5} size="sm" />);
    const ring = () => container.querySelector('[data-slot="tyre-badge-ring"]');
    expect(ring()).toHaveClass('size-7');
    rerender(<TyreBadge compound="M" age={5} size="lg" />);
    expect(ring()).toHaveClass('size-14');
  });
});
