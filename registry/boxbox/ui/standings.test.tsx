import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import {
  Standings,
  type StandingsEntry,
  formatPointsGained,
  formatStandingsChange,
  formatStandingsPoints,
  sortStandings,
  standingsEntryLabel,
} from '@/registry/boxbox/ui/standings';

const entries: StandingsEntry[] = [
  {
    id: 'mso',
    name: 'MSO',
    color: '#C78B46',
    position: 2,
    points: 180,
    gained: 18,
    positionChange: 1,
  },
  {
    id: 'evo',
    name: 'EVO',
    color: '#C78B46',
    position: 1,
    points: 186,
    gained: 0,
    positionChange: 0,
  },
  { id: 'tre', name: 'TRE', position: 3, points: 171, positionChange: -1 },
];

const rowIds = () =>
  [...document.querySelectorAll('[data-slot="standings-row"]')].map((row) =>
    row.getAttribute('data-id'),
  );
const part = (id: string, slot: string) =>
  document.querySelector(
    `[data-slot="standings-row"][data-id="${id}"] [data-slot="standings-${slot}"]`,
  );

describe('formatStandingsPoints', () => {
  it('prints whole points, and one decimal for a half-points race', () => {
    expect(formatStandingsPoints(186)).toBe('186');
    expect(formatStandingsPoints(12.5)).toBe('12.5');
  });
});

describe('formatPointsGained', () => {
  it('prints what the race gained with a plus, and nothing for none', () => {
    expect(formatPointsGained(18)).toBe('+18');
    expect(formatPointsGained(0.5)).toBe('+0.5');
    expect(formatPointsGained(0)).toBe('');
    expect(formatPointsGained(undefined)).toBe('');
  });
});

describe('formatStandingsChange', () => {
  it('marks a gain and a loss with the count, and nothing for no change', () => {
    expect(formatStandingsChange(2)).toBe('▲2');
    expect(formatStandingsChange(-1)).toBe('▼1');
    expect(formatStandingsChange(0)).toBe('');
    expect(formatStandingsChange(undefined)).toBe('');
  });
});

describe('sortStandings', () => {
  it('orders by the positions given, without touching them', () => {
    expect(sortStandings(entries).map((entry) => entry.id)).toEqual(['evo', 'mso', 'tre']);
    expect(entries.map((entry) => entry.id)).toEqual(['mso', 'evo', 'tre']);
  });
});

describe('standingsEntryLabel', () => {
  it('says the place, the points, what the race gained and the move', () => {
    expect(standingsEntryLabel(entries[0]!)).toBe(
      'P2 MSO, 180 points, 18 in this race, up 1 place.',
    );
    expect(standingsEntryLabel(entries[2]!)).toBe('P3 TRE, 171 points, down 1 place.');
    expect(
      standingsEntryLabel({
        id: 'x',
        name: 'Aster Forge',
        position: 9,
        points: 1,
        positionChange: -3,
      }),
    ).toBe('P9 Aster Forge, 1 point, down 3 places.');
  });
});

describe('Standings', () => {
  it('lists the entries in position order, one sentence per row', () => {
    render(<Standings entries={entries} />);
    const list = screen.getByRole('list', { name: 'Standings' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(rowIds()).toEqual(['evo', 'mso', 'tre']);
    expect(screen.getByText('P1 EVO, 186 points.')).toBeInTheDocument();
  });

  it('paints the columns and hides them from assistive technology', () => {
    render(<Standings entries={entries} />);
    expect(part('mso', 'position')?.textContent).toBe('2');
    expect(part('mso', 'name')?.textContent).toBe('MSO');
    expect(part('mso', 'change')?.textContent).toBe('▲1');
    expect(part('mso', 'change')).toHaveAttribute('data-change', 'gain');
    expect(part('tre', 'change')).toHaveAttribute('data-change', 'loss');
    expect(part('mso', 'gained')?.textContent).toBe('+18');
    expect(part('evo', 'gained')?.textContent).toBe('');
    expect(part('mso', 'points')?.textContent).toBe('180');
    expect(part('mso', 'color')).toHaveStyle({ backgroundColor: '#C78B46' });
    for (const slot of ['position', 'color', 'name', 'change', 'gained', 'points']) {
      expect(part('mso', slot)).toHaveAttribute('aria-hidden');
    }
  });

  it('follows a new order and new points', () => {
    const { rerender } = render(<Standings entries={entries} />);
    rerender(
      <Standings
        entries={[
          { ...entries[0]!, position: 1, points: 205, gained: 25 },
          { ...entries[1]!, position: 2 },
          entries[2]!,
        ]}
      />,
    );
    expect(rowIds()).toEqual(['mso', 'evo', 'tre']);
    expect(
      screen.getByText('P1 MSO, 205 points, 25 in this race, up 1 place.'),
    ).toBeInTheDocument();
  });

  it('shows the top rows only with maxRows', () => {
    render(<Standings entries={entries} maxRows={2} />);
    expect(rowIds()).toEqual(['evo', 'mso']);
  });

  it('keeps an accessible name the caller gives it', () => {
    render(<Standings entries={entries} aria-label="Drivers' standings" size="sm" />);
    expect(screen.getByRole('list', { name: "Drivers' standings" })).toHaveAttribute(
      'data-size',
      'sm',
    );
  });

  it('reorders and shows the points as plain text under reduced motion', () => {
    const { rerender } = render(
      <MotionConfig reducedMotion="always">
        <Standings entries={entries} />
      </MotionConfig>,
    );
    expect(part('evo', 'points')?.querySelector('[data-slot="rolling-number"]')).toBeNull();
    rerender(
      <MotionConfig reducedMotion="always">
        <Standings
          entries={[
            { ...entries[2]!, position: 1 },
            { ...entries[1]!, position: 2 },
          ]}
        />
      </MotionConfig>,
    );
    expect(rowIds()).toEqual(['tre', 'evo']);
    expect(part('tre', 'points')?.textContent).toBe('171');
  });
});
