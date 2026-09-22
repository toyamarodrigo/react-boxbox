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

function renderReplay(path = '/replay') {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
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
    // One marker per car running that lap, drawn on the invented circuit.
    expect(screen.getByRole('img', { name: 'Track map, 4 cars' })).toBeInTheDocument();
    expect(screen.getByText(/interpolated from lap times/i)).toBeInTheDocument();
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
