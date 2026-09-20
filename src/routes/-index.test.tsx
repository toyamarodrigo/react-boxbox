import { render, screen } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { getRouter } from '../router';

describe('home', () => {
  it('shows the boxbox brand and navigation', async () => {
    const router = getRouter();
    router.update({ history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: /Every second/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get started/ })).toHaveAttribute(
      'href',
      '/docs/installation',
    );
  });
});
