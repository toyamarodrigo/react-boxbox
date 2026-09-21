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

  it('draws no wear ring when wear is left out', () => {
    const { container } = render(<TyreBadge compound="S" age={12} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[data-slot="tyre-badge"]')).not.toHaveAttribute('data-wear');
  });

  it('draws the wear arc and reports the wear on the root', () => {
    const { container } = render(<TyreBadge compound="S" age={12} wear={35} />);
    const badge = container.querySelector('[data-slot="tyre-badge"]');
    expect(badge).toHaveAttribute('data-wear', '35');
    expect(badge).toHaveAttribute('data-wear-warning', 'false');
    expect(container.querySelector('[data-slot="tyre-badge-ring"] svg circle')).toBeInTheDocument();
  });

  it('flips the warning flag at the threshold, default and custom', () => {
    const wearFlag = (container: HTMLElement) =>
      container.querySelector('[data-slot="tyre-badge"]')?.getAttribute('data-wear-warning');
    const { container, rerender } = render(<TyreBadge compound="M" wear={69} />);
    expect(wearFlag(container)).toBe('false');
    rerender(<TyreBadge compound="M" wear={70} />);
    expect(wearFlag(container)).toBe('true');
    rerender(<TyreBadge compound="M" wear={45} wearWarning={40} />);
    expect(wearFlag(container)).toBe('true');
    rerender(<TyreBadge compound="M" wear={45} wearWarning={90} />);
    expect(wearFlag(container)).toBe('false');
  });

  it('clamps wear to 0 and 100', () => {
    const { container, rerender } = render(<TyreBadge compound="H" wear={-20} />);
    const badge = () => container.querySelector('[data-slot="tyre-badge"]');
    expect(badge()).toHaveAttribute('data-wear', '0');
    expect(badge()).toHaveAttribute('data-wear-warning', 'false');
    rerender(<TyreBadge compound="H" wear={140} />);
    expect(badge()).toHaveAttribute('data-wear', '100');
    expect(badge()).toHaveAttribute('data-wear-warning', 'true');
  });

  it('speaks the wear percentage alongside the compound and age', () => {
    const { rerender } = render(<TyreBadge compound="S" age={24} wear={72} />);
    expect(screen.getByRole('img', { name: 'Soft tyre, 24 laps, 72% worn' })).toBeInTheDocument();
    rerender(<TyreBadge compound="S" isNew wear={0} />);
    expect(screen.getByRole('img', { name: 'Soft tyre, new, 0% worn' })).toBeInTheDocument();
  });

  it('changes the ring size class with the size prop', () => {
    const { rerender, container } = render(<TyreBadge compound="M" age={5} size="sm" />);
    const ring = () => container.querySelector('[data-slot="tyre-badge-ring"]');
    expect(ring()).toHaveClass('size-7');
    rerender(<TyreBadge compound="M" age={5} size="lg" />);
    expect(ring()).toHaveClass('size-14');
  });
});
