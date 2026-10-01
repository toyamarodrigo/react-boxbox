import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
 * Lets the frames the router schedules for itself — its scroll restoration, above all — run
 * before the test looks at what it did. Two turns: one for the frame, one for anything that
 * frame schedules in turn.
 */
async function settleFrames() {
  for (let turn = 0; turn < 2; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
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

/** The search the router is on, which is where the followed driver and the column live. */
const searchOf = (router: ReturnType<typeof getRouter>) =>
  router.state.location.search as { driver?: string; round?: number; value?: string };

const followedRow = () => document.querySelector('[data-slot="timing-tower-row"][data-followed]');
const sectorCard = () => document.querySelector('[data-slot="sector-times"]');
const sectorValues = () =>
  [...document.querySelectorAll('[data-slot="sector-times-sector"]')].map((sector) => [
    sector.getAttribute('data-status'),
    sector.textContent?.replace(/,.*/, ''),
  ]);
const trapCard = () => document.querySelector('[data-slot="speed-trap"]');
const trapPart = (slot: string) =>
  trapCard()?.querySelector(`[data-slot="speed-trap-${slot}"]`)?.textContent;

/** The same race with every sector and every trap reading missing: a season OpenF1 never covered. */
const untimedRace = () => ({
  ...race,
  laps: race.laps.map((lap) => ({
    ...lap,
    rows: lap.rows.map((row) => ({
      ...row,
      sectorMs: [null, null, null] as [null, null, null],
      speedTrapKph: null,
    })),
  })),
});
const banner = () => document.querySelector('[data-slot="flag-banner"]');
const bands = () => [...document.querySelectorAll('[data-slot="timeline-neutralisation"]')];
const bandRow = () => document.querySelector('[data-slot="timeline-neutralisations"]');
const flaggedSectors = () => [...document.querySelectorAll('[data-slot="track-map-sector"]')];
/** The same race with nothing from race control: an older season, or a source failure. */
const quietRace = () => ({ ...race, raceControl: [] });
const rowButton = (driverId: string) =>
  document.querySelector<HTMLElement>(
    `[data-driver="${driverId}"] [data-slot="timing-tower-row-button"]`,
  );
/** What one row's value column reads, which is the whole subject of the timing-column control. */
const rowValueOf = (driverId: string) =>
  document.querySelector(`[data-driver="${driverId}"] [data-slot="timing-tower-value"]`)
    ?.textContent;
const columnButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Timing column' })).getByRole('button', { name });
const racePicker = () => screen.getByRole('button', { name: 'Race' });
/** Opens the race picker and picks the race with this label. */
async function pickRace(label: string) {
  fireEvent.click(racePicker());
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

beforeEach(() => {
  clearReplayCache();
  // jsdom has no `scrollIntoView`, and the race picker's list scrolls its selected option into
  // view as soon as it opens.
  Element.prototype.scrollIntoView = vi.fn();
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
    expect(racePicker()).toHaveTextContent('2030 Test');
  });

  // SPIKE (issue #9): the Onboard view spike is honoured on the Monza race only, never here.
  it('keeps the Track Map, without the Onboard view spike, on any race but Monza', async () => {
    renderReplay(`/replay?season=${race.season}&round=${race.round}&onboard=spike`);
    expect(await screen.findByRole('group', { name: 'Track map, 4 cars' })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="onboard-view"]')).toBeNull();
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

describe('replay page, race picker', () => {
  // Two races of the season on screen and one classic race from an earlier one.
  const second = { ...race, id: '2030-2', round: 2, name: 'Second Grand Prix', date: '2030-03-15' };
  const classic = {
    ...race,
    id: '2029-5',
    season: 2029,
    round: 5,
    name: 'Classic Grand Prix',
    circuit: 'Old Circuit',
    date: '2029-06-01',
  };
  const entryOf = (from: typeof race) => ({
    ...index.races[0]!,
    id: from.id,
    season: from.season,
    round: from.round,
    name: from.name,
    circuit: from.circuit,
    date: from.date,
  });

  beforeEach(() => {
    const byId = new Map([race, second, classic].map((entry) => [entry.id, entry]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) {
          return jsonResponse({ ...index, races: [race, classic, second].map(entryOf) });
        }
        const found = byId.get(url.replace(/^.*\//, '').replace(/\.json$/, ''));
        if (found) return jsonResponse(found);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
  });

  const optionNames = (group: HTMLElement) =>
    within(group)
      .getAllByRole('option')
      .map((option) => option.textContent);

  it('shows the newest race on the trigger', async () => {
    renderReplay();
    expect(await screen.findByRole('heading', { name: second.name })).toBeInTheDocument();
    expect(racePicker()).toHaveTextContent('2030 Second');
  });

  it('groups the season on screen, newest first, above the classics', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: second.name });
    fireEvent.click(racePicker());

    const season = await screen.findByRole('group', { name: '2030' });
    // Under the season's heading the year goes without saying; the classics mix seasons.
    expect(optionNames(season)).toEqual(['Second', 'Test']);
    expect(optionNames(screen.getByRole('group', { name: 'Classics' }))).toEqual(['2029 Classic']);
    expect(document.querySelector('[data-slot="command-separator"]')).not.toBeNull();
    // The race on screen is the one marked.
    expect(screen.getByRole('option', { name: 'Second' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('option', { name: 'Test' })).not.toHaveAttribute('aria-current');
  });

  it('filters the races as the viewer types, by name or circuit', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: second.name });
    fireEvent.click(racePicker());
    const input = await screen.findByPlaceholderText('Search races…');

    fireEvent.change(input, { target: { value: 'old circ' } });
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        '2029 Classic',
      ]),
    );

    // The year still finds the races listed without it.
    fireEvent.change(input, { target: { value: '2030' } });
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Second',
        'Test',
      ]),
    );

    fireEvent.change(input, { target: { value: 'nowhere at all' } });
    expect(await screen.findByText('No race matches.')).toBeInTheDocument();
  });

  it('opens the picked race, closes, and drops the moment and the followed and compared drivers', async () => {
    const router = renderReplay('/replay?driver=CHA&vs=ALP&t=30&value=interval');
    await screen.findByRole('heading', { name: second.name });

    await pickRace('2029 Classic');
    expect(await screen.findByRole('heading', { name: classic.name })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ season: 2029, round: 5, value: 'interval' });
    expect(racePicker()).toHaveTextContent('2029 Classic');
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
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
    // Charlie started fifth and is running third, so it has gained two places.
    const gained = document.querySelector('[data-figure="gained"]');
    expect(gained).toHaveTextContent('+2');
    expect(gained).toHaveTextContent('gained 2 places');
    // During the race only the followed car shows positions gained, in its panel.
    expect(document.querySelectorAll('[data-slot="timing-tower-positions-gained"]')).toHaveLength(
      1,
    );
  });

  it('marks a pit lane start in the followed row, counted from the last slot', async () => {
    renderReplay('/replay?driver=DEL');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'delta'));

    const gained = document.querySelector('[data-figure="gained"]');
    const position = Number(followedRow()?.getAttribute('data-position'));
    // Four cars started, so the pit lane counts as fourth.
    expect(gained).toHaveTextContent('PL');
    expect(gained?.querySelector('[data-slot="timing-tower-positions-gained"]')).toHaveAttribute(
      'data-pit-lane-start',
      'true',
    );
    expect(gained).toHaveTextContent(
      `started from the pit lane, ${position === 4 ? 'no places gained' : `gained ${4 - position}`}`,
    );
  });

  it('shows positions gained on every classified row of the results, and none for a retirement', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'End' });
    await waitFor(() => expect(screen.getByText('WINNER')).toBeInTheDocument());

    const gained = (driverId: string) =>
      document.querySelector(
        `[data-slot="timing-tower-row"][data-driver="${driverId}"] [data-slot="timing-tower-positions-gained"]`,
      );
    expect(gained('bravo')).toHaveTextContent('+1');
    expect(gained('alpha')).toHaveTextContent('−1');
    expect(gained('charlie')).toHaveTextContent('+2');
    expect(gained('delta')).toBeEmptyDOMElement();
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

    await pickRace('Second');
    await waitFor(() => expect(searchOf(router).round).toBe(2));
    expect(searchOf(router).driver).toBeUndefined();
    // The new search carries the column mode over, and it is the default here: an absent mode
    // must stay absent rather than reach the URL as the word `undefined`.
    expect(router.state.location.searchStr).not.toMatch(/value/);
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
    // The router restores the scroll for the *first* navigation too, in a frame of its own after
    // the page has rendered. On a loaded machine that frame can land after the clear below, and
    // the test would then read the arrival of the page as the follow having scrolled. Settling
    // the frames first is what makes the assertion about following and nothing else.
    await settleFrames();
    scrollTo.mockClear();

    fireEvent.click(rowButton('charlie')!);
    await waitFor(() => expect(searchOf(router).driver).toBe('CHA'));
    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'charlie'));
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(searchOf(router).driver).toBeUndefined());
    expect(scrollTo).not.toHaveBeenCalled();

    await pickRace('Test');
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

describe('replay page, timing column', () => {
  /**
   * One lap in, with the clock stopped on the boundary. Delta is the row the two modes disagree
   * about most: three quarters of a minute behind the leader, three seconds behind the car ahead.
   */
  async function atLapTwo(path = '/replay') {
    const router = renderReplay(path);
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(rowValueOf('delta')).not.toBe('—'));
    return router;
  }

  it('measures the gap to the leader until it is asked for anything else', async () => {
    const router = await atLapTwo();

    expect(columnButton('Gap')).toHaveAttribute('aria-pressed', 'true');
    expect(columnButton('Interval')).toHaveAttribute('aria-pressed', 'false');
    expect(rowValueOf('delta')).toBe('+39.4');
    expect(screen.getAllByText('Gap to leader').length).toBe(race.drivers.length);
    expect(searchOf(router).value).toBeUndefined();
  });

  it('switches the column to the interval, and says so in the search', async () => {
    const router = await atLapTwo();

    fireEvent.click(columnButton('Interval'));
    await waitFor(() => expect(searchOf(router).value).toBe('interval'));
    await waitFor(() => expect(rowValueOf('delta')).toBe('+3.030'));
    expect(columnButton('Interval')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('Interval').length).toBe(race.drivers.length + 1);
  });

  // The default is the one every viewer starts on, so it is stripped rather than written out.
  it('takes the column back out of the search when the gap is picked again', async () => {
    const router = await atLapTwo('/replay?value=interval');

    fireEvent.click(columnButton('Gap'));
    await waitFor(() => expect(searchOf(router).value).toBeUndefined());
    expect(rowValueOf('delta')).toBe('+39.4');
  });

  it('honours the column in the search params on arrival', async () => {
    await atLapTwo('/replay?value=interval');

    expect(columnButton('Interval')).toHaveAttribute('aria-pressed', 'true');
    expect(rowValueOf('delta')).toBe('+3.030');
  });

  // `validateSearch` parses, so without a `.catch()` this URL would be a route error rather than
  // a page. A mistyped link is a bad link, not a broken page.
  it('falls back to the gap on a value it does not know, without erroring', async () => {
    await atLapTwo('/replay?value=foo');

    expect(screen.queryByText(/Invalid|Error/)).toBeNull();
    expect(columnButton('Gap')).toHaveAttribute('aria-pressed', 'true');
    expect(rowValueOf('delta')).toBe('+39.4');
  });

  it('keeps the column across a race change, though the followed driver still goes', async () => {
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
    const router = renderReplay('/replay?driver=CHA&value=interval');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    await pickRace('Second');
    await waitFor(() => expect(searchOf(router).round).toBe(2));
    expect(searchOf(router).value).toBe('interval');
    expect(searchOf(router).driver).toBeUndefined();
    await waitFor(() => expect(columnButton('Interval')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('takes the control away once the column is the result', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'End' });
    await waitFor(() => expect(screen.getByText('WINNER')).toBeInTheDocument());

    expect(screen.queryByRole('group', { name: 'Timing column' })).toBeNull();
  });
});

describe('replay page, moment link', () => {
  const raceTime = () => screen.getByRole('slider', { name: 'Race time' });
  const copyButton = () => screen.getByRole('button', { name: 'Copy link to this moment' });

  /** jsdom has no clipboard, which is also what the page must survive. */
  function stubClipboard() {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('opens the race at the time in the search, paused', async () => {
    renderReplay('/replay?t=160');
    await screen.findByRole('heading', { name: race.name });

    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '160000'));
    expect(screen.getByText('Lap 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    // Long enough for a running clock to have ticked.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(raceTime()).toHaveAttribute('aria-valuenow', '160000');
  });

  it('opens at the start on a time it cannot read, without erroring', async () => {
    for (const t of ['soon', '-5']) {
      renderReplay(`/replay?t=${t}`);
      await screen.findByRole('heading', { name: race.name });
      await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

      expect(screen.queryByText(/Invalid|Error/)).toBeNull();
      expect(raceTime()).toHaveAttribute('aria-valuenow', '0');
      cleanup();
    }
  });

  it('copies the race, the view and the race time in whole seconds', async () => {
    const writeText = stubClipboard();
    renderReplay('/replay?driver=CHA&vs=bra,xyz,ALP&value=interval&t=100.7');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '100700'));

    fireEvent.click(copyButton());
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const url = new URL(writeText.mock.calls[0]![0]);
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe('/replay');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      season: String(race.season),
      round: String(race.round),
      driver: 'CHA',
      // The compared drivers as the page read them: known codes only, in the tower's spelling.
      vs: 'BRA,ALP',
      value: 'interval',
      t: '100',
    });
    // The label says so where a screen reader hears it, then goes back.
    const copied = await screen.findByRole('button', { name: 'Copied' });
    expect(within(copied).getByText('Copied')).toHaveAttribute('aria-live', 'polite');
    expect(
      await screen.findByRole(
        'button',
        { name: 'Copy link to this moment' },
        {
          timeout: 3000,
        },
      ),
    ).toBeInTheDocument();
  });

  it('leaves the defaults out of the link, and compared drivers nobody is followed for', async () => {
    const writeText = stubClipboard();
    renderReplay('/replay?vs=BRA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.click(copyButton());
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const url = new URL(writeText.mock.calls[0]![0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      season: String(race.season),
      round: String(race.round),
      t: '0',
    });
  });

  it('says so when there is no clipboard to write to', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.click(copyButton());
    expect(await screen.findByRole('button', { name: 'Could not copy' })).toBeInTheDocument();
  });

  it('does not write the race time to the URL while the replay plays', async () => {
    const router = renderReplay('/replay?t=10');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '10000'));
    const href = router.state.location.href;

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() =>
      expect(Number(raceTime().getAttribute('aria-valuenow'))).toBeGreaterThan(10000),
    );
    fireEvent.keyDown(raceTime(), { key: 'End' });
    await waitFor(() => expect(screen.getByText('WINNER')).toBeInTheDocument());

    expect(router.state.location.href).toBe(href);
  });
});

describe('replay page, sectors and speed trap', () => {
  it('fills the followed row in sector by sector as the lap runs', async () => {
    renderReplay('/replay?driver=CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    // The sector card replaces the LAST figure, so the lap time is only said once.
    expect(sectorCard()).not.toBeNull();
    expect(document.querySelector('[data-figure="last"]')).toBeNull();
    // Nothing has been run at the start of the race, so nothing is claimed.
    expect(sectorValues()).toEqual([
      ['unset', 'S1—'],
      ['unset', 'S2—'],
      ['unset', 'S3—'],
    ]);

    // One leader lap in, charlie is 100 s into its own 160 s lap: S1 is done, S2 is not.
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(sectorValues()[0]).toEqual(['personal', 'S148.000']));
    expect(sectorValues().slice(1)).toEqual([
      ['unset', 'S2—'],
      ['unset', 'S3—'],
    ]);
  });

  it('shows the leader in the trap card, and the followed driver once there is one', async () => {
    const router = renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(trapCard()).not.toBeNull());

    // Before anyone has crossed the line the card keeps its shape and claims no record.
    expect(trapPart('plate')).toContain('ALP');
    expect(trapPart('reading')).toContain('—');
    expect(trapPart('best')).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(trapPart('reading')).toContain('240'));
    // The best is the best of the race so far, which is the only reading taken so far.
    expect(trapPart('best')).toContain('ALP');
    expect(trapPart('best')).toContain('240');

    fireEvent.click(rowButton('charlie')!);
    await waitFor(() => expect(searchOf(router).driver).toBe('CHA'));
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));

    // Charlie crossed at 160 s with 180 km/h; bravo's second lap took the record by then.
    await waitFor(() => expect(trapPart('plate')).toContain('CHA'));
    expect(trapPart('reading')).toContain('180');
    expect(trapPart('best')).toContain('BRA');
    expect(trapPart('best')).toContain('242');
  });

  it('keeps the old figures for a race OpenF1 never covered', async () => {
    const untimed = untimedRace();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(untimed);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
    renderReplay('/replay?driver=CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    // Neither a card of em dashes nothing will ever fill, nor a missing lap time.
    expect(sectorCard()).toBeNull();
    expect(trapCard()).toBeNull();
    expect(document.querySelector('[data-figure="last"]')).not.toBeNull();
    expect(document.querySelector('[data-figure="gained"]')).toHaveTextContent('+2');
  });
});

describe('replay page, race control', () => {
  /** Serves one race instead of the fixture, for a case that needs a different dataset. */
  const serve = (body: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(body);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
  };

  it('flies the flag over the map and hides the banner while the track is green', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    // Nothing is flying at the start, and a green bar for two hours would only be noise.
    expect(banner()).toBeNull();

    // The virtual safety car is out from 60 s to 120 s, which covers the first lap boundary.
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(banner()).not.toBeNull());
    expect(banner()).toHaveAttribute('data-status', 'vsc');
    expect(banner()).toHaveTextContent('VIRTUAL SAFETY CAR');
  });

  it('paints the flagged marshalling sectors on the map', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    expect(flaggedSectors()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    // Sectors 2 and 3 of 4 are yellow and touch, so the map draws them as one half-lap arc.
    await waitFor(() => expect(flaggedSectors()).toHaveLength(1));
    const arc = flaggedSectors()[0];
    expect(arc).toHaveAttribute('data-status', 'yellow');
    expect(arc).toHaveAttribute('stroke-dasharray', '0.5 0.5');
    expect(screen.getByText(/marshalling posts/)).toBeInTheDocument();
  });

  it('lists the messages up to the race time, newest first', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Race control' }));

    const feed = await screen.findByRole('list', { name: 'Race control' });
    const lines = () => within(feed).getAllByRole('listitem');
    // Only what race control had said by the start of the race.
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toHaveTextContent('GREEN LIGHT - PIT EXIT OPEN');

    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(lines()).toHaveLength(5));
    expect(lines()[0]).toHaveTextContent('VSC DEPLOYED');
    expect(lines()[0]).toHaveTextContent('L1');
    expect(lines().at(-1)).toHaveTextContent('GREEN LIGHT - PIT EXIT OPEN');

    // To the flag: a message addressed to one car names it by the code the tower shows.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'End' });
    await waitFor(() => expect(lines()).toHaveLength(race.raceControl.length));
    const limits = lines().find((line) => line.textContent?.includes('TRACK LIMITS'));
    expect(limits).toHaveTextContent('CHA');
  });

  it('has no tab and only the chequered flag for a race with no race control', async () => {
    serve(quietRace());
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Strategy' })).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: 'Race control' })).toBeNull();

    // Nothing over the map through the race; the chequered flag at the end, as before.
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    expect(banner()).toBeNull();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'End' });
    await waitFor(() => expect(banner()).not.toBeNull());
    expect(banner()).toHaveAttribute('data-status', 'chequered');
  });
});

describe('replay page, neutralisation bands', () => {
  /** Serves one race instead of the fixture, for a case that needs a different dataset. */
  const serve = (body: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(body);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
  };

  /** The fixture with a safety car after its virtual one: the two kinds in one race. */
  const bothKinds = () => ({
    ...race,
    raceControl: [
      ...race.raceControl,
      {
        atMs: 150_000,
        lap: 2,
        flag: null,
        category: 'SafetyCar',
        scope: null,
        sector: null,
        driverId: null,
        message: 'SAFETY CAR DEPLOYED',
      },
      {
        atMs: 250_000,
        lap: 3,
        flag: null,
        category: 'SafetyCar',
        scope: null,
        sector: null,
        driverId: null,
        message: 'SAFETY CAR IN THIS LAP',
      },
    ],
  });

  const description = () => {
    const id = screen.getByRole('slider', { name: 'Race time' }).getAttribute('aria-describedby');
    return id === null ? null : document.getElementById(id)?.textContent;
  };

  it('draws one band per period, in the kind’s own colour', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(bands()).toHaveLength(1));

    const [band] = bands();
    // The one period the fixture carries: the virtual safety car from 60s to 120s of a 297s race.
    expect(band).toHaveAttribute('data-status', 'vsc');
    expect(band).toHaveClass('bg-flag-yellow');
    expect(band).toHaveStyle({ left: `${(60_000 / 297_000) * 100}%` });
    // The stripe is what tells it from a safety car, which is the same yellow without one.
    expect(band?.getAttribute('style')).toContain('repeating-linear-gradient');
    expect(band?.getAttribute('style')).toContain('--flag-yellow-foreground');
  });

  it('draws both kinds of a race that ran both, in race order', async () => {
    serve(bothKinds());
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(bands()).toHaveLength(2));

    expect(bands().map((band) => band.getAttribute('data-status'))).toEqual(['vsc', 'sc']);
    // The safety car is the same yellow, painted solid.
    expect(bands()[1]).toHaveClass('bg-flag-yellow');
    expect(bands()[1]?.getAttribute('style')).not.toContain('repeating-linear-gradient');
  });

  it('has no row at all for a race with no race control', async () => {
    serve(quietRace());
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(screen.getByText('Lap 1 of 3')).toBeInTheDocument());

    expect(bandRow()).toBeNull();
    expect(bands()).toHaveLength(0);
    // Nothing to say, so the slider carries no description either.
    expect(screen.getByRole('slider', { name: 'Race time' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });

  it('is decorative: nothing to focus, nothing to click, no drag taken from the slider', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(bands()).toHaveLength(1));

    expect(bandRow()).toHaveAttribute('aria-hidden');
    expect(bandRow()?.querySelectorAll('button')).toHaveLength(0);
    for (const band of bands()) {
      expect(band.tagName).toBe('SPAN');
      expect(band).not.toHaveAttribute('tabindex');
      expect(band).not.toHaveAttribute('role');
    }

    // Clicking one moves nothing: the bar seeks by its slider alone.
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(screen.getByText('Lap 2 of 3')).toBeInTheDocument());
    const band = bands()[0];
    if (band) fireEvent.click(band);
    expect(screen.getByText('Lap 2 of 3')).toBeInTheDocument();
  });

  it('describes the whole bar in one sentence, naming each kind', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(bands()).toHaveLength(1));

    expect(description()).toBe('One virtual safety car period: laps 1 to 2.');
  });

  it('names both kinds in one sentence for a race that ran both', async () => {
    serve(bothKinds());
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(bands()).toHaveLength(2));

    expect(description()).toBe(
      'Two neutralisation periods: virtual safety car laps 1 to 2 and safety car laps 2 to 3.',
    );
    // The sentence is a description, not the value: seeking does not re-announce it.
    const slider = screen.getByRole('slider', { name: 'Race time' });
    const before = slider.getAttribute('aria-describedby');
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(screen.getByText('Lap 2 of 3')).toBeInTheDocument());
    expect(slider.getAttribute('aria-describedby')).toBe(before);
    expect(description()).toBe(
      'Two neutralisation periods: virtual safety car laps 1 to 2 and safety car laps 2 to 3.',
    );
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

describe('replay page, lap grid', () => {
  const gridRows = () => [...document.querySelectorAll('[data-slot="lap-grid-row"]')];
  const cells = () => [...document.querySelectorAll('[data-slot="lap-grid-cell"]')];
  const gridRow = (driverId: string) =>
    document.querySelector(`[data-slot="lap-grid-row"][data-driver="${driverId}"]`);
  const cellsOf = (driverId: string) => [
    ...(gridRow(driverId)?.querySelectorAll('[data-slot="lap-grid-cell"]') ?? []),
  ];
  const measureButton = (name: string) =>
    within(screen.getByRole('group', { name: 'Lap grid measure' })).getByRole('button', { name });
  const toTheFlag = () =>
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'End' });

  /** Opens the panel on the Laps tab and waits for the grid. */
  async function openLaps() {
    fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
    // Radix switches a tab on mousedown, not on the click that follows it.
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Laps' }));
    return screen.findByRole('list', { name: 'Lap grid' });
  }

  it('lists every car in tower order and grows with the clock', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await openLaps();

    const towerOrder = [...document.querySelectorAll('[data-slot="timing-tower-row"]')].map((row) =>
      row.getAttribute('data-driver'),
    );
    expect(gridRows().map((row) => row.getAttribute('data-driver'))).toEqual(towerOrder);
    // Nobody has completed a lap on the grid.
    expect(cells()).toHaveLength(0);

    // At the leader's second line: alpha's first lap, bravo's first two, charlie's and delta's first.
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
    await waitFor(() => expect(cells()).toHaveLength(5));
    expect(cellsOf('bravo').map((cell) => cell.getAttribute('title'))).toEqual([
      'Lap 1 · 1:41.000 · opening lap, virtual safety car, not counted',
      'Lap 2 · 1:38.000 · virtual safety car, not counted',
    ]);

    // At the flag every lap is drawn, the lapped car's last one included; the retired car's row
    // stops at its last lap and is faded like the tower's.
    toTheFlag();
    await waitFor(() => expect(cells()).toHaveLength(11));
    expect(cellsOf('bravo')[2]).toHaveAttribute('data-status', 'fastest');
    expect(cellsOf('bravo')[2]).toHaveAttribute('title', 'Lap 3 · 1:38.000 · race best');
    expect(cellsOf('delta')).toHaveLength(2);
    expect(gridRow('delta')).toHaveClass('opacity-50');
    // One sentence per row stands in for the colours.
    expect(
      screen.getByRole('button', {
        name: 'ALP, best lap 1:39.000 on lap 3, 1 personal best, 0 race bests',
      }),
    ).toBeInTheDocument();
  });

  it('switches the measure to a sector', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await openLaps();
    toTheFlag();
    await waitFor(() => expect(cells()).toHaveLength(11));

    expect(measureButton('Lap')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(measureButton('S2'));
    expect(measureButton('S2')).toHaveAttribute('aria-pressed', 'true');
    expect(measureButton('Lap')).toHaveAttribute('aria-pressed', 'false');
    // Charlie's second lap has no S2 in the source: an empty cell, not a guess.
    expect(cellsOf('charlie')[1]).toHaveAttribute('data-status', 'unset');
    expect(cellsOf('bravo')[2]).toHaveAttribute('title', 'Lap 3 · S2 34.300 · race best');
  });

  it('offers no sector picker on a race with no sector times, and shows the lap', async () => {
    const untimed = untimedRace();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(untimed);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await openLaps();

    expect(screen.queryByRole('group', { name: 'Lap grid measure' })).toBeNull();
    toTheFlag();
    await waitFor(() => expect(cells()).toHaveLength(11));
    expect(cellsOf('bravo')[2]).toHaveAttribute('title', 'Lap 3 · 1:38.000 · race best');
  });

  it('follows the driver whose row is clicked, without dimming the others', async () => {
    const router = renderReplay();
    await screen.findByRole('heading', { name: race.name });
    const grid = await openLaps();

    fireEvent.click(within(grid).getByRole('button', { name: /^BRA/ }));
    await waitFor(() => expect(searchOf(router).driver).toBe('BRA'));
    expect(followedRow()).toHaveAttribute('data-driver', 'bravo');

    expect(gridRow('bravo')).toHaveAttribute('data-followed', 'true');
    expect(within(grid).getByRole('button', { name: /^BRA/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(gridRow('alpha')).not.toHaveClass('opacity-50');
  });
});

describe('replay page, pit stop card', () => {
  const stopCard = () => document.querySelector('[data-card="live"] [data-slot="pit-stop-card"]');
  const raceTime = () => screen.getByRole('slider', { name: 'Race time' });

  /**
   * Charlie stops at the end of lap one, 20 s in the lane, from mediums to softs: on the invented
   * circuit's pit lane that is in at 152 s and out at 172 s, so the card is up until 180 s.
   */
  function servePittedRace(compounds = true) {
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
      stints: race.stints.map((car) =>
        car.driverId === 'charlie'
          ? {
              driverId: 'charlie',
              stints: [
                { fromLap: 1, toLap: 1, compound: compounds ? 'M' : null },
                { fromLap: 2, toLap: 3, compound: compounds ? 'S' : null },
              ],
            }
          : car,
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
  }

  it('shows the followed driver’s stop under the map during the pit window', async () => {
    servePittedRace();
    renderReplay('/replay?driver=CHA&t=155');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '155000'));

    await waitFor(() => expect(stopCard()).not.toBeNull());
    expect(stopCard()?.closest('figure')?.querySelector('[data-slot="track-map"]')).not.toBeNull();
    expect(
      screen.getByText('CHA pit stop 1, medium tyres off, soft on, pit lane 3.0 seconds, in P3.'),
    ).toBeInTheDocument();
    expect(stopCard()).toHaveAttribute('data-out', 'false');
  });

  it('settles on the lane time at the exit and goes eight seconds later', async () => {
    servePittedRace();
    renderReplay('/replay?driver=CHA&t=175');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '175000'));

    await waitFor(() => expect(stopCard()).toHaveAttribute('data-out', 'true'));
    expect(
      screen.getByText(
        'CHA pit stop 1, medium tyres off, soft on, pit lane 20.0 seconds, in P3, out P3.',
      ),
    ).toBeInTheDocument();

    // Ten seconds on is past the exit and the eight seconds after it.
    fireEvent.keyDown(raceTime(), { key: 'PageUp' });
    expect(raceTime()).toHaveAttribute('aria-valuenow', '185000');
    await waitFor(() => expect(stopCard()).toBeNull());
  });

  it('shows nothing without a followed driver, or for another car', async () => {
    servePittedRace();
    renderReplay('/replay?t=155');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '155000'));
    expect(stopCard()).toBeNull();

    cleanup();
    servePittedRace();
    renderReplay('/replay?driver=ALP&t=155');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'alpha'));
    expect(raceTime()).toHaveAttribute('aria-valuenow', '155000');
    expect(stopCard()).toBeNull();
  });

  it('goes when the followed driver is released', async () => {
    servePittedRace();
    renderReplay('/replay?driver=CHA&t=155');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(stopCard()).not.toBeNull());

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(stopCard()).toBeNull());
  });

  it('shows the stop without the tyre pair in a race with no compounds', async () => {
    servePittedRace(false);
    renderReplay('/replay?driver=CHA&t=155');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(stopCard()).not.toBeNull());

    expect(stopCard()?.querySelector('[data-slot="pit-stop-card-tyres"]')).toBeNull();
    expect(screen.getByText('CHA pit stop 1, pit lane 3.0 seconds, in P3.')).toBeInTheDocument();
  });
});

describe('replay page, battle card', () => {
  const battleCard = () => document.querySelector('[data-card="live"] [data-slot="battle-card"]');
  const raceTime = () => screen.getByRole('slider', { name: 'Race time' });

  /**
   * The test race without its virtual safety car: bravo and alpha are a second apart at the lines
   * of laps one and two, so a battle for the lead starts at alpha's line at 200 s and ends at the
   * next one, 2 s apart, at 299 s.
   */
  function serveRaceWithoutSafetyCar() {
    const green = { ...race, raceControl: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(green);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
  }

  it('shows the battle highest up the order under the map', async () => {
    serveRaceWithoutSafetyCar();
    renderReplay('/replay?t=250');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '250000'));

    await waitFor(() => expect(battleCard()).not.toBeNull());
    expect(
      battleCard()?.closest('figure')?.querySelector('[data-slot="track-map"]'),
    ).not.toBeNull();
    // Under the map, not over it: nothing in the map's box but the map itself.
    expect(document.querySelector('[data-slot="track-map"]')?.contains(battleCard() ?? null)).toBe(
      false,
    );
    expect(screen.getByText(/^Battle for P1, BRA ahead of ALP, interval /)).toBeInTheDocument();
  });

  it('shows the same battle while the followed driver is in none', async () => {
    serveRaceWithoutSafetyCar();
    renderReplay('/replay?driver=CHA&t=250');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'charlie'));
    await waitFor(() => expect(battleCard()).not.toBeNull());
    expect(screen.getByText(/^Battle for P1, BRA ahead of ALP/)).toBeInTheDocument();
  });

  it('shows nothing before the battle starts', async () => {
    serveRaceWithoutSafetyCar();
    renderReplay('/replay?t=150');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '150000'));
    expect(battleCard()).toBeNull();
  });

  it('shows nothing when the laps it needs ran under a neutralisation', async () => {
    // The race as it is, with the virtual safety car over laps one and two.
    renderReplay('/replay?t=250');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '250000'));
    expect(battleCard()).toBeNull();
  });
});

describe('replay page, compare', () => {
  const picker = () => screen.getByRole('group', { name: 'Compared drivers' });
  const pickerButton = (name: string) => within(picker()).getByRole('button', { name });
  const pressed = () =>
    within(picker())
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent);
  const compareRows = () =>
    [...document.querySelectorAll('[data-slot="compare-row"]')].map((row) =>
      row.getAttribute('data-driver'),
    );
  const figure = (driverId: string, slot: string) =>
    document.querySelector(
      `[data-slot="compare-row"][data-driver="${driverId}"] [data-slot="${slot}"]`,
    )?.textContent;
  const vsOf = (router: ReturnType<typeof getRouter>) =>
    (router.state.location.search as { vs?: string }).vs;

  /** Opens the panel on the Compare tab. */
  async function openCompare() {
    fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
    // Radix switches a tab on mousedown, not on the click that follows it.
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Compare' }));
  }

  /** The test race with a fifth car, retired after two laps, so a fourth pick can be refused. */
  function serveFiveCars() {
    const five = {
      ...race,
      drivers: [
        ...race.drivers,
        { id: 'echo', code: 'ECH', number: 5, firstName: 'Ed', lastName: 'Echo', teamId: 'blue' },
      ],
      laps: race.laps.map((lap) =>
        lap.lap === 3
          ? lap
          : {
              ...lap,
              rows: [
                ...lap.rows,
                {
                  ...lap.rows.at(-1)!,
                  driverId: 'echo',
                  position: 5,
                  lapTimeMs: 170_000,
                  cumulativeMs: lap.lap * 170_000,
                },
              ],
            },
      ),
      results: [
        ...race.results,
        { ...race.results.at(-1)!, driverId: 'echo', position: 5, positionText: 'R', grid: 5 },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse(five);
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
  }

  it('asks for a followed driver first, and ignores the compared ones without one', async () => {
    renderReplay('/replay?vs=BRA,CHA');
    await screen.findByRole('heading', { name: race.name });
    await openCompare();

    expect(await screen.findByText(/^Follow a driver first/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Compared drivers' })).toBeNull();
    expect(document.querySelector('[data-emphasis="secondary"]')).toBeNull();
  });

  it('offers every other driver in tower order and writes each toggle into the URL', async () => {
    const router = renderReplay('/replay?driver=ALP');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());
    await openCompare();

    const towerCodes = [...document.querySelectorAll('[data-slot="timing-tower-row"]')]
      .map((row) => race.drivers.find((d) => d.id === row.getAttribute('data-driver'))?.code)
      .filter((code) => code !== 'ALP');
    expect(
      within(await screen.findByRole('group', { name: 'Compared drivers' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(towerCodes);
    expect(pressed()).toEqual([]);
    expect(screen.getByText('Pick up to 3 drivers to compare with ALP.')).toBeInTheDocument();
    const entries = router.history.length;

    fireEvent.click(pickerButton('BRA'));
    await waitFor(() => expect(vsOf(router)).toBe('BRA'));
    fireEvent.click(pickerButton('CHA'));
    await waitFor(() => expect(vsOf(router)).toBe('BRA,CHA'));
    expect(pressed()).toEqual(towerCodes.filter((code) => code === 'BRA' || code === 'CHA'));
    fireEvent.click(pickerButton('BRA'));
    await waitFor(() => expect(vsOf(router)).toBe('CHA'));
    fireEvent.click(pickerButton('CHA'));
    await waitFor(() => expect(vsOf(router)).toBeUndefined());
    expect(router.state.location.searchStr).not.toMatch(/vs/);
    // A view of the race, like the followed driver: no history entries.
    expect(router.history.length).toBe(entries);
  });

  it('stops at three, from a click or from the URL', async () => {
    serveFiveCars();
    const router = renderReplay('/replay?driver=ALP&vs=BRA,CHA');
    await screen.findByRole('heading', { name: race.name });
    await openCompare();
    await screen.findByRole('group', { name: 'Compared drivers' });
    expect(pickerButton('ECH')).toBeEnabled();

    fireEvent.click(pickerButton('DEL'));
    await waitFor(() => expect(vsOf(router)).toBe('BRA,CHA,DEL'));
    expect(pickerButton('ECH')).toBeDisabled();
    expect(pickerButton('BRA')).toBeEnabled();
    cleanup();

    serveFiveCars();
    renderReplay('/replay?driver=ALP&vs=BRA,CHA,DEL,ECH');
    await screen.findByRole('heading', { name: race.name });
    await openCompare();
    await screen.findByRole('group', { name: 'Compared drivers' });
    expect(pickerButton('ECH')).toHaveAttribute('aria-pressed', 'false');
    expect(pickerButton('ECH')).toBeDisabled();
  });

  it('reads the URL forgivingly, without erroring', async () => {
    renderReplay('/replay?driver=ALP&vs=xyz,cha,CHA,ALP');
    await screen.findByRole('heading', { name: race.name });
    await openCompare();
    await screen.findByRole('group', { name: 'Compared drivers' });

    expect(pressed()).toEqual(['CHA']);
    expect(screen.queryByText(/Invalid|Error/)).toBeNull();
  });

  it('keeps the compared drivers when the followed driver changes, less the new one', async () => {
    const router = renderReplay('/replay?driver=ALP&vs=BRA,CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).toHaveAttribute('data-driver', 'alpha'));

    fireEvent.click(rowButton('bravo')!);
    await waitFor(() => expect(searchOf(router).driver).toBe('BRA'));
    expect(vsOf(router)).toBe('CHA');
  });

  it('draws the time to the followed driver as the clock runs, then one row per driver', async () => {
    const restoreSize = stubElementSize();
    try {
      renderReplay('/replay?driver=ALP&vs=BRA,CHA');
      await screen.findByRole('heading', { name: race.name });
      await openCompare();

      const chart = await screen.findByRole('img', { name: /^Time difference to ALP/ });
      expect(chart).toHaveAccessibleName('Time difference to ALP. No laps completed of 3.');

      // At the leader's second line every car has crossed the line once, and only bravo twice.
      fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
      fireEvent.click(screen.getByRole('button', { name: 'Next lap' }));
      await waitFor(() => expect(chart).toHaveAttribute('data-laps', '1'));
      expect(chart).toHaveAccessibleName(
        'Time difference to ALP over 1 of 3 laps. BRA 1.0 seconds behind at lap 1. CHA 60.0 seconds behind at lap 1.',
      );
      expect(document.querySelectorAll('.recharts-line')).toHaveLength(3);
      // Every line ends in its code.
      expect(
        [...document.querySelectorAll('[data-slot="compare-chart-code"]')].map(
          (code) => code.textContent,
        ),
      ).toEqual(['ALP', 'BRA', 'CHA']);

      expect(compareRows()).toEqual(['alpha', 'bravo', 'charlie']);
      expect(figure('alpha', 'compare-best')).toBe('1:40.000 L1');
      // The opening lap never counts, and nobody has run another yet.
      expect(figure('alpha', 'compare-pace')).toBe('—');

      fireEvent.keyDown(screen.getByRole('slider', { name: 'Race time' }), { key: 'End' });
      await waitFor(() => expect(chart).toHaveAttribute('data-laps', '3'));
      expect(chart).toHaveAccessibleName(
        'Time difference to ALP over all 3 laps. BRA 2.0 seconds ahead at lap 3. CHA 179.0 seconds behind at lap 3.',
      );
      // Charlie is alpha's teammate, so its line is the dashed one.
      const dashes = [...document.querySelectorAll('.recharts-line-curve')].map((curve) =>
        curve.getAttribute('stroke-dasharray'),
      );
      expect(dashes.filter((dash) => dash === '5 3')).toHaveLength(1);
      expect(figure('charlie', 'compare-best')).toBe('2:38.000 L3');
      expect(figure('charlie', 'compare-pace')).toBe('2:39.000 2 laps');
      expect(figure('bravo', 'compare-stops')).toBe('0');
      expect(
        document.querySelectorAll('[data-slot="compare-row"] [data-slot="stint-bar"]'),
      ).toHaveLength(3);
    } finally {
      restoreSize();
    }
  });

  it('gives the compared cars the map’s lesser emphasis', async () => {
    renderReplay('/replay?driver=ALP&vs=CHA');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(followedRow()).not.toBeNull());

    const markers = () =>
      [...document.querySelectorAll('[data-slot="track-map-marker"]')].map((element) => [
        element.getAttribute('data-id'),
        element.getAttribute('data-emphasis'),
        element.getAttribute('data-dimmed'),
      ]);
    await waitFor(() =>
      expect(markers()).toEqual([
        ['alpha', 'true', null],
        ['bravo', null, 'true'],
        ['charlie', 'secondary', null],
        ['delta', null, 'true'],
      ]),
    );
  });
});

describe('replay page, standings', () => {
  const raceTime = () => screen.getByRole('slider', { name: 'Race time' });
  const tableButton = (name: string) =>
    within(screen.getByRole('group', { name: 'Standings table' })).getByRole('button', { name });
  const standingsRows = () =>
    [...document.querySelectorAll('[data-slot="standings-row"] [data-slot="standings-name"]')].map(
      (name) => name.textContent,
    );

  /** Opens the panel on the Standings tab. */
  async function openStandings() {
    fireEvent.click(await screen.findByRole('button', { name: 'Strategy' }));
    // Radix switches a tab on mousedown, not on the click that follows it.
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Standings' }));
  }

  it('projects the drivers at race time, the car that retires later still scoring', async () => {
    // At 250 s the order is BRA, ALP, CHA, DEL: 25, 18, 15 and 12 on top of the standings before.
    renderReplay('/replay?t=250');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '250000'));
    await openStandings();

    expect(await screen.findByRole('heading', { name: 'Projected' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: "Drivers' standings" })).toBeInTheDocument();
    expect(standingsRows()).toEqual(['ALP', 'BRA', 'CHA', 'DEL', 'ECH']);
    expect(screen.getByText('P3 CHA, 40 points, 15 in this race, up 1 place.')).toBeInTheDocument();
    // Echo is not in this race: it keeps its points and drops two places.
    expect(screen.getByText('P5 ECH, 30 points, down 2 places.')).toBeInTheDocument();
    expect(tableButton('Drivers')).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to the teams, each scoring what its cars do, and keeps the choice', async () => {
    const router = renderReplay('/replay?t=250');
    await screen.findByRole('heading', { name: race.name });
    await waitFor(() => expect(raceTime()).toHaveAttribute('aria-valuenow', '250000'));
    await openStandings();
    const search = router.state.location.searchStr;

    fireEvent.click(await screen.findByRole('button', { name: 'Teams' }));
    expect(await screen.findByRole('list', { name: "Teams' standings" })).toBeInTheDocument();
    expect(tableButton('Teams')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('P1 Blue Team, 152 points, 37 in this race.')).toBeInTheDocument();
    expect(screen.getByText('P2 Red Team, 140 points, 33 in this race.')).toBeInTheDocument();
    // How the page is being read, like the tab: not in the URL.
    expect(router.state.location.searchStr).toBe(search);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gaps' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Standings' }));
    expect(await screen.findByRole('list', { name: "Teams' standings" })).toBeInTheDocument();
  });

  it('shows the standings before the race until the start', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await openStandings();

    expect(await screen.findByRole('heading', { name: 'Projected' })).toBeInTheDocument();
    expect(standingsRows()).toEqual(['ALP', 'BRA', 'ECH', 'CHA', 'DEL']);
    expect(screen.getByText('P3 ECH, 30 points.')).toBeInTheDocument();
  });

  it('replaces the projection with the official standings at the chequered flag', async () => {
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await openStandings();
    fireEvent.keyDown(raceTime(), { key: 'End' });

    expect(await screen.findByRole('heading', { name: 'After round 1' })).toBeInTheDocument();
    expect(standingsRows()).toEqual(['ALP', 'BRA', 'CHA', 'ECH', 'DEL']);
    expect(screen.getByText('P4 ECH, 30 points, down 1 place.')).toBeInTheDocument();
    fireEvent.click(tableButton('Teams'));
    // Level on 140 with blue: the published order has red ahead on wins.
    expect(
      await screen.findByText('P1 Red Team, 140 points, 33 in this race, up 1 place.'),
    ).toBeInTheDocument();
  });

  it('says so for a race without standings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/index.json')) return jsonResponse(index);
        if (url.endsWith(`/${race.id}.json`)) return jsonResponse({ ...race, standings: null });
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }),
    );
    renderReplay();
    await screen.findByRole('heading', { name: race.name });
    await openStandings();

    expect(
      await screen.findByText('There are no standings for this race in the dataset.'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-slot="standings"]')).toBeNull();
  });
});
