import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LapCounter } from '@/registry/boxbox/ui/lap-counter';

describe('LapCounter', () => {
  it('renders the lap, the total, and a spoken sentence', () => {
    const { container } = render(<LapCounter lap={12} totalLaps={57} />);
    const root = container.querySelector('[data-slot="lap-counter"]');
    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-live', 'polite');
    expect(root).toHaveAttribute('data-final', 'false');
    expect(screen.getByText('LAP')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('57')).toBeInTheDocument();
    expect(screen.getByText('Lap 12 of 57')).toBeInTheDocument();
  });

  it('rolls the lap number through RollingNumber', () => {
    const { container } = render(<LapCounter lap={3} totalLaps={57} />);
    const roller = container.querySelector(
      '[data-slot="lap-counter-value"] [data-slot="rolling-number"]',
    );
    expect(roller).toHaveTextContent('3');
  });

  it('flips to the final lap on the last lap and back', () => {
    const { container, rerender } = render(<LapCounter lap={56} totalLaps={57} />);
    const root = () => container.querySelector('[data-slot="lap-counter"]');
    expect(root()).toHaveAttribute('data-final', 'false');
    rerender(<LapCounter lap={57} totalLaps={57} />);
    expect(root()).toHaveAttribute('data-final', 'true');
    expect(screen.getByText('FINAL LAP')).toBeInTheDocument();
    expect(screen.getByText('Final lap')).toBeInTheDocument();
    rerender(<LapCounter lap={1} totalLaps={57} />);
    expect(root()).toHaveAttribute('data-final', 'false');
  });

  it('never calls lap zero of zero the final lap', () => {
    const { container } = render(<LapCounter lap={0} totalLaps={0} />);
    expect(container.querySelector('[data-slot="lap-counter"]')).toHaveAttribute(
      'data-final',
      'false',
    );
  });

  it('takes a custom label and a size, and passes className through', () => {
    const { container } = render(
      <LapCounter lap={4} totalLaps={20} label="TOUR" size="lg" className="w-40" />,
    );
    expect(screen.getByText('TOUR')).toBeInTheDocument();
    const root = container.querySelector('[data-slot="lap-counter"]');
    expect(root).toHaveClass('w-40');
    expect(container.querySelector('[data-slot="lap-counter-value"]')).toHaveClass('text-2xl');
  });
});
