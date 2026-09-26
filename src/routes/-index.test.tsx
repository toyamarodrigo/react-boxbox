import { act, render, screen, within } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroSequence } from '../components/site/home/hero-sequence';
import { visible } from '../content';
import { testReplayIndex, testReplayRace } from '../data/replay-fixtures';
import { clearReplayCache } from '../data/use-replay-data';
import { getRouter } from '../router';

const index = testReplayIndex();
const race = testReplayRace();

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

function renderHome() {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(<RouterProvider router={router} />);
}

// The replay section fetches the curated index and one race; jsdom has no `IntersectionObserver`,
// so the section treats itself as visible and mounts the lazy showcase straight away.
beforeEach(() => {
  clearReplayCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/index.json')) return jsonResponse(index);
      if (url.endsWith(`/${race.id}.json`)) return jsonResponse(race);
      return { ok: false, status: 404, statusText: 'Not Found' } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe('home replay section', () => {
  it('plays the newest curated race and links to it', async () => {
    renderHome();

    expect(await screen.findByRole('heading', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByText('The whole library in one race')).toBeInTheDocument();

    // The lazy chunk and both fetches resolve before the race line appears.
    expect(await screen.findByText(race.name)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(race.circuit))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Watch the replay/ })).toHaveAttribute(
      'href',
      `/replay?season=${race.season}&round=${race.round}`,
    );

    // One marker per car running the opening lap, on the circuit the race resolves to.
    const map = await screen.findByRole('img', { name: /^Track map/ });
    expect(map).toHaveAttribute('data-slot', 'track-map');
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
