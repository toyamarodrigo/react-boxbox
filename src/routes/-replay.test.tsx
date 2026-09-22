import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testReplayIndex, testReplayRace } from '../data/replay-fixtures';
import { clearReplayCache } from '../data/use-replay-data';
import { stubElementSize } from '../test/chart-size';
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

/**
 * Mounted on `document`, as TanStack Start does in the browser. The root route renders `<html>`
 * and `<body>`, which React 19 resolves to the real ones; a root inside a `div` then sends
 * React DOM into an endless walk the moment anything portals into `document.body`, such as a
 * tooltip.
 */
function renderReplay(path = '/replay') {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />, { container: document });
  return router;
}

/** The search the router is on, which is where the followed driver lives. */
const searchOf = (router: ReturnType<typeof getRouter>) =>
  router.state.location.search as { driver?: string; round?: number };

const followedRow = () => document.querySelector('[data-slot="timing-tower-row"][data-followed]');
const rowButton = (driverId: string) =>
  document.querySelector<HTMLElement>(
    `[data-driver="${driverId}"] [data-slot="timing-tower-row-button"]`,
  );

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

describe('replay page', () => {
  it('loads the newest race and runs it through the components', async () => {
    renderReplay();

    expect(await screen.findByRole('heading', { name: race.name })).toBeInTheDocument();
    expect(screen.getByText(/jolpica-f1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jolpica-f1' })).toHaveAttribute(
      'href',
      'https://github.com/jolpica/jolpica-f1',
    );

    const tower = await screen.findByRole('list', { name: 'Timing tower' });
    expect(within(tower).getAllByRole('listitem')).toHaveLength(race.drivers.length);
    expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument();
    // One marker per car running that lap, drawn on the invented circuit, with its pit lane.
    // A group rather than an image: every car on it can be clicked to follow that driver.
    expect(screen.getByRole('group', { name: 'Track map, 4 cars' })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="track-map-pit-lane"]')).not.toBeNull();
    // Both the map caption and the tower note say so.
    expect(screen.getAllByText(/interpolated from lap times/i)).toHaveLength(2);
  });

  it('is the showcase, not a docs page: subtitle, no sidebar', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });

    expect(screen.getByText('The whole library in one race')).toBeInTheDocument();
    // The mobile sheet is closed, so the sidebar `aside` would be the only docs navigation.
    expect(screen.queryByRole('navigation', { name: 'Documentation' })).toBeNull();
  });

  it('steps forward and back a lap', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    expect(screen.getByText('Lap 2 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous lap' }));
    expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument();
  });

  it('scrubs the race on the timeline and snaps the cars there', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    const slider = screen.getByRole('slider', { name: 'Race time' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '297000');
    expect(slider).toHaveAttribute('aria-valuetext', 'Lap 1 of 3, 0:00:00.000');
    // One tick per interior lap boundary.
    expect(
      slider.closest('[data-slot="slider"]')?.parentElement?.querySelectorAll('span.w-px'),
    ).toHaveLength(2);

    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '297000');
    expect(slider).toHaveAttribute('aria-valuetext', 'Lap 3 of 3, 0:04:57.000');
    expect(screen.queryByText('Lap 1 of 3')).not.toBeInTheDocument();

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument();
    // The clock jumped, so the markers snap instead of sliding across the circuit.
    const marker = document.querySelector<HTMLElement>('[data-slot="track-map-marker"]');
    expect(marker?.style.transitionDuration).toBe('0ms');
  });

  it('names each pit stop on the timeline and seeks to it', async () => {
    // Charlie stops on lap one, 20 s in the lane, so one mark hangs under the bar. The stop
    // starts at 152 s, when the leader is already on lap two.
    const pitted = {
      ...race,
      laps: race.laps.map((lap) =>
        lap.lap === 1
          ? {
              ...lap,
              rows: lap.rows.map((row) =>
                row.driverId === 'charlie'
                  ? { ...row, inPit: true, pitDurationMs: 20_000, pitStop: 1 }
                  : row,
              ),
            }
          : lap,
      ),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(pitted);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    const mark = screen.getByRole('button', { name: 'CHA pit stop 1, lap 1, 20.0s' });
    expect(mark).toHaveAttribute('data-slot', 'timeline-pit-stop');

    // Focus opens the tooltip the way hovering does, without a pointer in jsdom.
    fireEvent.focus(mark);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('CHA pit stop 1, lap 1, 20.0s');

    fireEvent.click(mark);
    const slider = screen.getByRole('slider', { name: 'Race time' });
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/^Lap 2 of 3/));
    expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThan(100_000);
  });

  it('honours the season and round in the search params', async () => {
    renderReplay(`/replay?season=${race.season}&round=${race.round}`);
    expect(await screen.findByRole('heading', { name: race.name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers a retry when the race does not load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
    renderReplay();

    await waitFor(() => expect(screen.getByText(/This race did not load/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('replay page, followed driver', () => {
  it('expands the row of the driver the search params name', async () => {
    renderReplay('/replay?driver=CHA');
    await screen.findByRole('heading', { name: race.name });

    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'charlie'));
    expect(document.querySelectorAll('[data-slot="timing-tower-expanded"]')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'CHA details' })).toBeInTheDocument();
    expect(rowButton('charlie')).toHaveAttribute('aria-pressed', 'true');
    expect(rowButton('alpha')).toHaveAttribute('aria-pressed', 'false');
    // Charlie started fifth and is running third, so it has made up two places.
    expect(document.querySelector('[data-figure="places"]')).toHaveTextContent('▲2');
  });

  it('ignores a code no driver in the race carries', async () => {
    renderReplay('/replay?driver=ZZZ');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    expect(followedRow()).toBeNull();
    expect(document.querySelectorAll('[data-slot="timing-tower-expanded"]')).toHaveLength(0);
  });

  it('follows a driver on a row click and lets it go on a second one', async () => {
    const router = renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(rowButton('charlie')).not.toBeNull());

    fireEvent.click(rowButton('charlie')!);
    await waitFor(() => expect(searchOf(router).driver).toBe('CHA'));
    expect(followedRow()).toHaveAttribute('data-driver', 'charlie');

    fireEvent.click(rowButton('charlie')!);
    await waitFor(() => expect(searchOf(router).driver).toBeUndefined());
    expect(followedRow()).toBeNull();
  });

  it('releases the followed driver on Escape, but not while a slider has the key', async () => {
    const router = renderReplay('/replay?driver=CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'Escape' });
    expect(searchOf(router).driver).toBe('CHA');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(searchOf(router).driver).toBeUndefined());
    expect(followedRow()).toBeNull();
  });

  it('drops the followed driver when the race changes', async () => {
    const second = { ...race, id: '2030-2', round: 2, name: 'Second Grand Prix' };
    const races = [
      index.races[0]!,
      { ...index.races[0]!, id: second.id, round: 2, name: second.name },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse({ ...index, races });
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(race);
        if (url.endsWith(`/${second.id}.json`)) return jsonResponse(second);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
    const router = renderReplay('/replay?driver=CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '2030 Second' }));
    await waitFor(() => expect(searchOf(router).round).toBe(2));
    expect(searchOf(router).driver).toBeUndefined();
    await waitFor(() => expect(followedRow()).toBeNull());
  });

  it('follows a driver from the map and dims the other cars', async () => {
    const router = renderReplay();
    await screen.findByRole('heading', { name: race.name });
    const marker = await screen.findByRole('button', { name: 'CHA' });
    expect(marker).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(marker);
    await waitFor(() => expect(searchOf(router).driver).toBe('CHA'));
    expect(followedRow()).toHaveAttribute('data-driver', 'charlie');

    const dimmed = [...document.querySelectorAll('[data-slot="track-map-marker"]')].map(
      (element) => [element.getAttribute('data-id'), element.getAttribute('data-dimmed')],
    );
    expect(dimmed).toEqual([
      ['alpha', 'true'],
      ['bravo', 'true'],
      ['charlie', null],
      ['delta', 'true'],
    ]);
    expect(screen.getByRole('button', { name: 'CHA' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not reset the scroll to follow, but a new race is a real page change', async () => {
    // The router has `scrollRestoration`, so it scrolls the window on every navigation it is
    // not told to leave alone. `window.scrollTo` is where that lands.
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const router = renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(rowButton('charlie')).not.toBeNull());
    scrollTo.mockClear();

    fireEvent.click(rowButton('charlie')!);
    await waitFor(() => expect(searchOf(router).driver).toBe('CHA'));
    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'charlie'));
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(searchOf(router).driver).toBeUndefined());
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Test$/ }));
    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0, left: 0 })),
    );
  });

  it('shows the followed car its tyres and its stints so far', async () => {
    renderReplay('/replay?driver=CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    // Charlie is on the medium set it started on, new at lap one.
    const tyre = document.querySelector('[data-figure="tyre"]');
    expect(tyre?.querySelector('[data-slot="tyre-badge"]')).toHaveAttribute('data-compound', 'M');
    expect(tyre).toHaveTextContent('0');

    const bar = followedRow()?.querySelector('[data-slot="stint-bar"]');
    expect(bar).toHaveAttribute('data-size', 'sm');
    expect(bar).toHaveAttribute('data-total-laps', '3');
    expect(bar).toHaveAttribute('data-current-lap', '1');
    expect([...bar!.querySelectorAll('[data-slot="stint-bar-segment"]')]).toHaveLength(2);
  });

  it('says so rather than guessing when the compound is unknown', async () => {
    // Delta has one stint and no compound for it.
    renderReplay('/replay?driver=DEL');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'delta'));

    const tyre = document.querySelector('[data-figure="tyre"]');
    expect(tyre?.querySelector('[data-slot="tyre-badge"]')).toBeNull();
    expect(tyre?.querySelector('[title="compound unknown"]')).not.toBeNull();
    expect(followedRow()?.querySelector('[data-slot="stint-bar-segment"]')).toHaveAttribute(
      'data-compound',
      'unknown',
    );
  });

  it('keeps the follow working once the race is over', async () => {
    const router = renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'End' });
    // The results listing replaces the live tower; the row is still there to be followed.
    await waitFor(() => expect(screen.getByText('WINNER')).toBeInTheDocument());

    fireEvent.click(rowButton('charlie')!);
    await waitFor(() => expect(searchOf(router).driver).toBe('CHA'));
    expect(screen.getByRole('group', { name: 'CHA details' })).toBeInTheDocument();
  });
});

describe('replay page, strategy panel', () => {
  const strategyLines = () => [...document.querySelectorAll('[data-slot="strategy-line"]')];

  it('stays closed until it is asked for', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });

    const header = await screen.findByRole('button', { name: 'Strategy' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(strategyLines()).toHaveLength(0);
  });

  it('lists every car in tower order, with the followed one picked out', async () => {
    renderReplay('/replay?driver=CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
    await waitFor(() => expect(strategyLines()).toHaveLength(4));

    const towerOrder = [...document.querySelectorAll('[data-slot="timing-tower-row"]')].map((row) =>
      row.getAttribute('data-driver'),
    );
    expect(strategyLines().map((line) => line.getAttribute('data-driver'))).toEqual(towerOrder);

    const charlie = strategyLines().find((line) => line.getAttribute('data-driver') === 'charlie');
    expect(charlie).toHaveAttribute('aria-pressed', 'true');
    expect(charlie?.querySelector('[data-slot="stint-bar"]')).toHaveAttribute('data-size', 'sm');
    expect(
      strategyLines().filter((line) => line.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
  });

  it('follows the driver whose line is clicked', async () => {
    const router = renderReplay();
    await screen.findByRole('heading', { name: race.name });

    fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
    await waitFor(() => expect(strategyLines()).toHaveLength(4));

    const line = strategyLines().find((entry) => entry.getAttribute('data-driver') === 'bravo');
    fireEvent.click(line!);
    await waitFor(() => expect(searchOf(router).driver).toBe('BRA'));
    expect(followedRow()).toHaveAttribute('data-driver', 'bravo');
  });

  it('swaps the strategy bars for the gap chart on the Gaps tab', async () => {
    const restoreSize = stubElementSize();
    try {
      renderReplay('/replay?driver=CHA');
      await screen.findByRole('heading', { name: race.name });

      fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
      await waitFor(() => expect(strategyLines()).toHaveLength(4));
      expect(screen.getByRole('tab', { name: 'Strategy' })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      // Radix switches a tab on mousedown, not on the click that follows it.
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gaps' }));
      const chart = await screen.findByRole('img', { name: /Gap to the leader/ });
      expect(strategyLines()).toHaveLength(0);

      // Nothing is drawn before the leader has finished a lap: the chart never runs ahead of the
      // race, and it picks the followed driver out of the field.
      expect(chart).toHaveAttribute('data-laps', '0');
      expect(chart).toHaveAttribute('data-emphasised', 'charlie');
      expect(chart).toHaveAccessibleName('Gap to the leader. No laps completed of 3.');

      fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
      await waitFor(() => expect(chart).toHaveAttribute('data-laps', '1'));
      expect(chart).toHaveAccessibleName(
        'Gap to the leader over 1 of 3 laps, 4 cars. CHA 60.0 seconds behind at lap 1.',
      );
      expect(document.querySelectorAll('.recharts-line')).toHaveLength(4);
    } finally {
      restoreSize();
    }
  });

  it('follows the driver whose gap line is clicked', async () => {
    const restoreSize = stubElementSize();
    try {
      const router = renderReplay();
      await screen.findByRole('heading', { name: race.name });

      fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gaps' }));
      await screen.findByRole('img', { name: /Gap to the leader/ });
      // Two laps, so every line has two points and a drawn curve to click.
      fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
      fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));

      // The lines are drawn in the grid's order, so the first curve is alpha's.
      const curve = await waitFor(() => document.querySelector('.recharts-line-curve')!);
      fireEvent.click(curve);
      await waitFor(() => expect(searchOf(router).driver).toBe('ALP'));
    } finally {
      restoreSize();
    }
  });
});
