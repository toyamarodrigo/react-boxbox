import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Driver, SectorTime, Team, TimingRow } from '@/registry/boxbox/lib/types';
import {
  TimingTower,
  formatGap,
  formatLapTime,
  rowValue,
  sortRows,
} from '@/registry/boxbox/ui/timing-tower';

const emptySectors = (): [SectorTime, SectorTime, SectorTime] => [
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
];

function makeRow(
  driverId: string,
  position: number,
  overrides: Partial<TimingRow> = {},
): TimingRow {
  return {
    driverId,
    position,
    gapToLeader: position === 1 ? 0 : 1.234,
    interval: position === 1 ? null : 0.567,
    lastLapTime: 91.512,
    bestLapTime: 91.2,
    sectors: emptySectors(),
    tyre: { compound: 'S', age: 4 },
    inPit: false,
    lapped: false,
    drs: false,
    positionChange: 0,
    ...overrides,
  };
}

const drivers: Record<string, Driver> = {
  one: { id: 'one', code: 'AAA', number: 1, firstName: 'Ada', lastName: 'One', teamId: 'red' },
  two: { id: 'two', code: 'BBB', number: 2, firstName: 'Bea', lastName: 'Two', teamId: 'red' },
  three: { id: 'three', code: 'CCC', number: 3, firstName: 'Cid', lastName: 'Tri', teamId: 'blue' },
};
const teams: Record<string, Team> = {
  red: { id: 'red', name: 'Aster Forge', color: '#C78B46' },
  blue: { id: 'blue', name: 'Quartz Vale', color: '#8146A8' },
};

describe('sortRows', () => {
  it('orders unsorted rows by position and keeps the input untouched', () => {
    const rows = [makeRow('three', 3), makeRow('one', 1), makeRow('two', 2)];
    expect(sortRows(rows).map((row) => row.driverId)).toEqual(['one', 'two', 'three']);
    expect(rows.map((row) => row.driverId)).toEqual(['three', 'one', 'two']);
  });

  it('is stable for rows that share a position', () => {
    const rows = [makeRow('two', 5), makeRow('three', 5), makeRow('one', 1)];
    expect(sortRows(rows).map((row) => row.driverId)).toEqual(['one', 'two', 'three']);
  });
});

describe('formatGap', () => {
  it('formats sub-ten-second gaps with three decimals', () => {
    expect(formatGap(1.234)).toBe('+1.234');
    expect(formatGap(0)).toBe('+0.000');
  });

  it('drops to one decimal from ten seconds and to minutes from sixty', () => {
    expect(formatGap(12.34)).toBe('+12.3');
    expect(formatGap(62.34)).toBe('+1:02.3');
    expect(formatGap(125)).toBe('+2:05.0');
  });

  it('renders a dash for a missing gap and keeps the sign of a negative one', () => {
    expect(formatGap(null)).toBe('—');
    expect(formatGap(-0.5)).toBe('-0.500');
  });
});

describe('formatLapTime', () => {
  it('formats laps as minutes, padded seconds, and milliseconds', () => {
    expect(formatLapTime(91.512)).toBe('1:31.512');
    expect(formatLapTime(5.2)).toBe('0:05.200');
    expect(formatLapTime(120)).toBe('2:00.000');
  });

  it('renders a dash when there is no lap yet', () => {
    expect(formatLapTime(null)).toBe('—');
  });
});

describe('rowValue', () => {
  it('shows LEADER, the gap, or the interval in gap modes', () => {
    const leader = makeRow('one', 1);
    const chaser = makeRow('two', 2);
    expect(rowValue(leader, 'leader', true)).toBe('LEADER');
    expect(rowValue(chaser, 'leader', false)).toBe('+1.234');
    expect(rowValue(chaser, 'interval', false)).toBe('+0.567');
  });

  it('shows the last lap time in lap time mode, leader included', () => {
    expect(rowValue(makeRow('one', 1), 'lapTime', true)).toBe('1:31.512');
    expect(rowValue(makeRow('two', 2, { lastLapTime: null }), 'lapTime', false)).toBe('—');
  });

  it('puts pit before every other state and marks lapped cars', () => {
    const pit = makeRow('two', 2, { inPit: true, lapped: true });
    expect(rowValue(pit, 'leader', false)).toBe('IN PIT');
    expect(rowValue(pit, 'lapTime', false)).toBe('IN PIT');
    expect(rowValue(makeRow('three', 3, { lapped: true }), 'leader', false)).toBe('+1 LAP');
  });
});

describe('TimingTower', () => {
  const rows = [
    makeRow('three', 3, { drs: true, positionChange: 1 }),
    makeRow('one', 1),
    makeRow('two', 2, { inPit: true }),
  ];

  it('renders rows in position order with the data attributes of each row', () => {
    const { container } = render(<TimingTower rows={rows} drivers={drivers} teams={teams} />);
    const tower = container.querySelector('[data-slot="timing-tower"]');
    expect(tower).toHaveAttribute('data-mode', 'leader');
    const rendered = [...container.querySelectorAll('[data-slot="timing-tower-row"]')];
    expect(rendered.map((row) => row.getAttribute('data-driver'))).toEqual(['one', 'two', 'three']);
    expect(rendered.map((row) => row.getAttribute('data-position'))).toEqual(['1', '2', '3']);
    expect(rendered[1]).toHaveAttribute('data-pit', 'true');
    expect(rendered[2]).toHaveAttribute('data-drs', 'true');
    expect(rendered[0]).toHaveAttribute('data-lapped', 'false');
    expect(screen.getByText('LEADER')).toBeInTheDocument();
    expect(screen.getByText('IN PIT')).toBeInTheDocument();
    expect(screen.getByText('AAA')).toBeInTheDocument();
  });

  it('limits the rows with maxRows', () => {
    const { container } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} maxRows={2} />,
    );
    expect(container.querySelectorAll('[data-slot="timing-tower-row"]')).toHaveLength(2);
    expect(screen.queryByText('CCC')).not.toBeInTheDocument();
  });

  it('drops the tyre badges when showTyre is false', () => {
    const { container, rerender } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} />,
    );
    expect(container.querySelectorAll('[data-slot="tyre-badge"]')).toHaveLength(3);
    rerender(<TimingTower rows={rows} drivers={drivers} teams={teams} showTyre={false} />);
    expect(container.querySelectorAll('[data-slot="tyre-badge"]')).toHaveLength(0);
  });

  it('shows the DRS tag only for eligible cars and hides it when showDrs is false', () => {
    const { rerender } = render(<TimingTower rows={rows} drivers={drivers} teams={teams} />);
    expect(screen.getAllByText('DRS')).toHaveLength(1);
    rerender(<TimingTower rows={rows} drivers={drivers} teams={teams} showDrs={false} />);
    expect(screen.queryByText('DRS')).not.toBeInTheDocument();
  });

  it('paints the fastest lap holder and the leading rows differently', () => {
    const { container } = render(
      <TimingTower
        rows={rows}
        drivers={drivers}
        teams={teams}
        mode="lapTime"
        highlightTop={1}
        fastestLapDriverId="three"
      />,
    );
    const values = [...container.querySelectorAll('[data-slot="timing-tower-value"]')];
    expect(values[2]).toHaveAttribute('data-tone', 'fastest');
    expect(values[0]).toHaveAttribute('data-tone', 'default');
    const rendered = container.querySelectorAll('[data-slot="timing-tower-row"]');
    expect(rendered[0]).toHaveClass('bg-primary/10');
    expect(rendered[1]).not.toHaveClass('bg-primary/10');
  });

  it('keeps only the remaining rows when maxRows shrinks', async () => {
    const { container, rerender } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} maxRows={3} />,
    );
    expect(container.querySelectorAll('[data-slot="timing-tower-row"]')).toHaveLength(3);
    rerender(<TimingTower rows={rows} drivers={drivers} teams={teams} maxRows={1} />);
    await waitFor(() => {
      const rendered = [...container.querySelectorAll('[data-slot="timing-tower-row"]')];
      expect(rendered.map((row) => row.getAttribute('data-driver'))).toEqual(['one']);
    });
  });

  it('marks the position cell with the direction of the change', () => {
    const { container } = render(<TimingTower rows={rows} drivers={drivers} teams={teams} />);
    const cells = [...container.querySelectorAll('[data-slot="timing-tower-position"]')];
    expect(cells.map((cell) => cell.getAttribute('data-change'))).toEqual(['none', 'none', 'gain']);
  });

  it('marks a lost position on the cell of the driver that dropped', () => {
    const dropped = [makeRow('one', 1), makeRow('two', 2, { positionChange: -2 })];
    const { container } = render(<TimingTower rows={dropped} drivers={drivers} teams={teams} />);
    const cells = [...container.querySelectorAll('[data-slot="timing-tower-position"]')];
    expect(cells.map((cell) => cell.getAttribute('data-change'))).toEqual(['none', 'loss']);
  });

  it('keeps the fastest lap tone when the flag moves to another driver', () => {
    const { container, rerender } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} fastestLapDriverId="one" />,
    );
    const tone = () =>
      [...container.querySelectorAll('[data-slot="timing-tower-value"]')].map((value) =>
        value.getAttribute('data-tone'),
      );
    expect(tone()).toEqual(['fastest', 'pit', 'default']);
    rerender(
      <TimingTower rows={rows} drivers={drivers} teams={teams} fastestLapDriverId="three" />,
    );
    expect(tone()).toEqual(['default', 'pit', 'fastest']);
  });

  it('uses renderRow to replace the default row', () => {
    const { container } = render(
      <TimingTower
        rows={rows}
        drivers={drivers}
        teams={teams}
        renderRow={(row, ctx) => (
          <div data-slot="custom-row">{`${ctx.index}:${ctx.driver.code}:${ctx.team?.name}:${row.position}`}</div>
        )}
      />,
    );
    expect(container.querySelectorAll('[data-slot="timing-tower-row"]')).toHaveLength(0);
    expect(screen.getByText('0:AAA:Aster Forge:1')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="custom-row"]')).toHaveLength(3);
  });
});
