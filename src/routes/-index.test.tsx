import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Home } from '@/routes/index';

describe('home', () => {
  it('shows the boxbox brand', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'boxbox' })).toBeInTheDocument();
  });
});
