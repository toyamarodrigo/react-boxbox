import { act, render, screen, within } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroSequence } from '../components/site/home/hero-sequence';
import { visible } from '../content';
import { getRouter } from '../router';

function renderHome() {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(<RouterProvider router={router} />);
}

describe('home', () => {
  it('shows the boxbox brand and navigation', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { name: /Every second/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get started/ })).toHaveAttribute(
      'href',
      '/docs/installation',
    );
    expect(screen.getByRole('link', { name: /Explore components/ })).toHaveAttribute(
      'href',
      '/components',
    );
  });

  it('lists every visible component in the grid', async () => {
    renderHome();
    await screen.findByRole('heading', { name: /Every second/ });

    const grid = screen.getByRole('list', { name: 'Components' });
    const links = within(grid).getAllByRole('link');
    const items = visible();

    expect(links).toHaveLength(items.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      items.map((item) => `/components/${item.slug}`),
    );
    for (const item of items) {
      expect(within(grid).getByRole('heading', { name: item.name })).toBeInTheDocument();
    }
  });
});

describe('hero sequence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals the timing tower once the lights go out', () => {
    vi.useFakeTimers();
    render(<HeroSequence interval={10} holdRange={[10, 10]} random={() => 0} />);

    expect(screen.queryByRole('list', { name: 'Timing tower' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('data-slot', 'start-lights');

    // Five lights at 10ms each, then a 10ms hold before lights out. Each tick
    // needs its own `act` so React can flush the state update that schedules
    // the next timer.
    for (let tick = 0; tick < 6; tick++) {
      act(() => {
        vi.advanceTimersByTime(10);
      });
    }

    expect(screen.getByRole('list', { name: 'Timing tower' })).toBeInTheDocument();
  });
});
