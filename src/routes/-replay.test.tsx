import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
}

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
    expect(screen.getByRole('img', { name: 'Track map, 4 cars' })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="track-map-pit-lane"]')).not.toBeNull();
    // Both the map caption and the tower note say so.
    expect(screen.getAllByText(/interpolated from lap times/i)).toHaveLength(2);
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
