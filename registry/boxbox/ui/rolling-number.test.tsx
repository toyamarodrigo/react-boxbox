import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RollingNumber } from './rolling-number';

describe('RollingNumber', () => {
  it('renders the value inside the rolling slot', () => {
    render(<RollingNumber value={7} />);
    const slot = screen.getByText('7').closest('[data-slot="rolling-number"]');
    expect(slot).not.toBeNull();
  });

  it('shows the new value after a change', () => {
    const { rerender } = render(<RollingNumber value={3} direction="up" />);
    rerender(<RollingNumber value={2} direction="up" />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
