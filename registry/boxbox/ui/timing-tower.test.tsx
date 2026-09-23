import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Driver, SectorTime, Team, TimingRow } from '@/registry/boxbox/lib/types';
import {
  TimingTower,
  formatGap,
  formatLapTime,
  isClassified,
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

  it('counts the laps a lapped car is down in gap mode, the way the results do', () => {
    expect(rowValue(makeRow('three', 3, { lapped: true, lapsBehind: 2 }), 'leader', false)).toBe(
      '+2 LAPS',
    );
    expect(rowValue(makeRow('three', 3, { lapped: true, lapsBehind: 1 }), 'leader', false)).toBe(
      '+1 LAP',
    );
    // A row that says it is lapped without saying by how much is one lap down.
    expect(rowValue(makeRow('three', 3, { lapped: true }), 'leader', false)).toBe('+1 LAP');
  });

  it('shows a lapped car its real interval, which is what interval mode is for', () => {
    const lapped = makeRow('three', 3, { lapped: true, lapsBehind: 2 });
    expect(rowValue(lapped, 'interval', false)).toBe('+0.567');
  });

  it('calls the car in front the leader in both modes', () => {
    const leader = makeRow('one', 1);
    expect(rowValue(leader, 'leader', true)).toBe('LEADER');
    expect(rowValue(leader, 'interval', true)).toBe('LEADER');
  });
});

describe('rowValue in results mode', () => {
  it.each([
    ['the winner', makeRow('one', 1), true, 'WINNER'],
    ['a gap to the winner', makeRow('two', 2), false, '+1.234'],
    ['one lap down', makeRow('two', 2, { lapped: true }), false, '+1 LAP'],
    ['several laps down', makeRow('two', 2, { lapped: true, lapsBehind: 3 }), false, '+3 LAPS'],
    ['a retirement', makeRow('two', 2, { finishStatus: 'dnf' }), false, 'DNF'],
    ['a disqualification', makeRow('two', 2, { finishStatus: 'dsq' }), false, 'DSQ'],
    ['a non-starter', makeRow('two', 2, { finishStatus: 'dns' }), false, 'DNS'],
    ['a winner that is still in the pit lane', makeRow('one', 1, { inPit: true }), true, 'WINNER'],
    ['a retirement even at the front', makeRow('one', 1, { finishStatus: 'dnf' }), true, 'DNF'],
  ] as [string, TimingRow, boolean, string][])('shows %s', (_label, row, isLeader, expected) => {
    expect(rowValue(row, 'results', isLeader)).toBe(expected);
  });

  it('treats a missing finish status as finished', () => {
    expect(isClassified(makeRow('two', 2))).toBe(true);
    expect(isClassified(makeRow('two', 2, { finishStatus: 'finished' }))).toBe(true);
    expect(isClassified(makeRow('two', 2, { finishStatus: 'dsq' }))).toBe(false);
  });
});

describe('TimingTower in results mode', () => {
  const results = [
    makeRow('one', 1, { points: 25 }),
    makeRow('two', 2, { points: 18, gapToLeader: 4.512, drs: true }),
    makeRow('three', 3, { finishStatus: 'dnf' }),
  ];

  it('shows the finishing order with the winner, the gap, and the retirement', () => {
    const { container } = render(
      <TimingTower rows={results} drivers={drivers} teams={teams} mode="results" />,
    );
    expect(container.querySelector('[data-slot="timing-tower"]')).toHaveAttribute(
      'data-mode',
      'results',
    );
    const values = [...container.querySelectorAll('[data-slot="timing-tower-value"]')];
    expect(values.map((value) => value.textContent)).toEqual(['WINNER', '+4.512', 'DNF']);
    expect(values[2]).toHaveAttribute('data-tone', 'retired');
    expect(values[0]).toHaveAttribute('data-tone', 'default');
  });

  it('lists a car that is out while the race runs: OUT, muted, faded, no tags', () => {
    const live = [
      makeRow('one', 1),
      makeRow('two', 2, { drs: true }),
      makeRow('three', 3, { finishStatus: 'dnf', inPit: true, drs: true, positionChange: -2 }),
    ];
    const { container } = render(
      <TimingTower rows={live} drivers={drivers} teams={teams} mode="leader" />,
    );
    const values = [...container.querySelectorAll('[data-slot="timing-tower-value"]')];
    expect(values.map((value) => value.textContent)).toEqual(['LEADER', '+1.234', 'OUT']);
    expect(values[2]).toHaveAttribute('data-tone', 'retired');

    const rows = [...container.querySelectorAll('[data-slot="timing-tower-row"]')];
    expect(rows.map((row) => row.getAttribute('data-out'))).toEqual([null, null, 'true']);
    expect(rows[2]).toHaveClass('opacity-50');
    expect(rows[2]?.textContent).not.toContain('PIT');
    expect(rows[2]?.querySelector('[data-slot="overtake-indicator"]')).toBeNull();
    // The one running car with the aid keeps its tag.
    expect(rows[1]?.querySelector('[data-slot="overtake-indicator"]')).not.toBeNull();
    expect(rowValue(live[2]!, 'interval', false)).toBe('OUT');
  });

  it('marks the unclassified rows', () => {
    const { container } = render(
      <TimingTower rows={results} drivers={drivers} teams={teams} mode="results" />,
    );
    const rendered = [...container.querySelectorAll('[data-slot="timing-tower-row"]')];
    expect(rendered.map((row) => row.getAttribute('data-classified'))).toEqual([
      'true',
      'true',
      'false',
    ]);
  });

  it('adds a points cell that is empty without points, and only in results mode', () => {
    const { container, rerender } = render(
      <TimingTower rows={results} drivers={drivers} teams={teams} mode="results" />,
    );
    const points = [...container.querySelectorAll('[data-slot="timing-tower-points"]')];
    expect(points.map((cell) => cell.textContent)).toEqual(['25', '18', '']);
    rerender(<TimingTower rows={results} drivers={drivers} teams={teams} mode="leader" />);
    expect(container.querySelectorAll('[data-slot="timing-tower-points"]')).toHaveLength(0);
  });

  it('never shows the overtake tag, and keeps the tyre badge under showTyre', () => {
    const { container, rerender } = render(
      <TimingTower rows={results} drivers={drivers} teams={teams} mode="results" showOvertake />,
    );
    expect(container.querySelectorAll('[data-slot="overtake-indicator"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="tyre-badge"]')).toHaveLength(3);
    rerender(
      <TimingTower
        rows={results}
        drivers={drivers}
        teams={teams}
        mode="results"
        showTyre={false}
      />,
    );
    expect(container.querySelectorAll('[data-slot="tyre-badge"]')).toHaveLength(0);
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

  it('hides the tag through showOvertake as well, and shows it by default', () => {
    const { rerender } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} showOvertake={false} />,
    );
    expect(screen.queryByText('DRS')).not.toBeInTheDocument();
    rerender(<TimingTower rows={rows} drivers={drivers} teams={teams} showOvertake />);
    expect(screen.getAllByText('DRS')).toHaveLength(1);
  });

  it('renders the tag in overtake mode as OVT', () => {
    const { container } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} overtakeMode="overtake" />,
    );
    const tag = container.querySelector('[data-slot="overtake-indicator"]');
    expect(tag).toHaveAttribute('data-mode', 'overtake');
    expect(tag).toHaveAttribute('data-state', 'active');
    expect(tag).toHaveTextContent('OVT');
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

  it('makes no row operable until onRowClick is given', () => {
    const { container, rerender } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} />,
    );
    expect(container.querySelectorAll('[data-slot="timing-tower-row-button"]')).toHaveLength(0);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);

    rerender(<TimingTower rows={rows} drivers={drivers} teams={teams} onRowClick={() => {}} />);
    expect(container.querySelectorAll('[data-slot="timing-tower-row-button"]')).toHaveLength(3);
  });

  it('reports the clicked row with its driver, team and place in the order', () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} onRowClick={onRowClick} />,
    );
    const buttons = container.querySelectorAll('[data-slot="timing-tower-row-button"]');
    fireEvent.click(buttons[1]!);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    const [row, ctx] = onRowClick.mock.calls[0]!;
    expect(row.driverId).toBe('two');
    expect(ctx).toMatchObject({ index: 1 });
    expect(ctx.driver.code).toBe('BBB');
    expect(ctx.team.name).toBe('Aster Forge');
  });

  it('marks the followed row and presses its button', () => {
    const { container } = render(
      <TimingTower
        rows={rows}
        drivers={drivers}
        teams={teams}
        followedId="two"
        onRowClick={() => {}}
      />,
    );
    const rendered = [...container.querySelectorAll('[data-slot="timing-tower-row"]')];
    expect(rendered.map((row) => row.getAttribute('data-followed'))).toEqual([null, 'true', null]);
    expect(rendered[1]).toHaveClass('bg-primary/10');
    const pressed = [...container.querySelectorAll('[data-slot="timing-tower-row-button"]')].map(
      (button) => button.getAttribute('aria-pressed'),
    );
    expect(pressed).toEqual(['false', 'true', 'false']);
  });

  it('expands the followed row only, inside that row, with a named group', () => {
    const { container } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} followedId="two" />,
    );
    const panels = container.querySelectorAll('[data-slot="timing-tower-expanded"]');
    expect(panels).toHaveLength(1);
    expect(panels[0]?.closest('[data-slot="timing-tower-row"]')).toHaveAttribute(
      'data-driver',
      'two',
    );
    expect(screen.getByRole('group', { name: 'BBB details' })).toBeInTheDocument();
  });

  it('clips the panel and keeps its padding inside, so the row can collapse to nothing', () => {
    const { container } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} followedId="two" />,
    );
    const panel = container.querySelector('[data-slot="timing-tower-expanded"]');
    expect(panel).toHaveClass('overflow-hidden');
    // Padding on the element whose height animates would keep it off zero.
    expect(panel?.className).not.toMatch(/(^|\s)p[xybtlre]?-/);
    const content = panel?.querySelector('[data-slot="timing-tower-expanded-content"]');
    expect(content).toHaveClass('px-2', 'pb-2');
    expect(content?.querySelector('[data-slot="timing-tower-expanded-figures"]')).not.toBeNull();
  });

  it('gives renderExpanded the neighbours in the shown order', () => {
    const seen: (string | undefined)[] = [];
    render(
      <TimingTower
        rows={rows}
        drivers={drivers}
        teams={teams}
        followedId="two"
        renderExpanded={(_row, ctx) => {
          seen.push(ctx.ahead?.driverId, ctx.behind?.driverId);
          return <span>panel</span>;
        }}
      />,
    );
    expect(seen).toEqual(['one', 'three']);
    expect(screen.getByText('panel')).toBeInTheDocument();
  });

  it('has no car ahead of the leader', () => {
    const seen: { ahead?: string; behind?: string } = {};
    render(
      <TimingTower
        rows={rows}
        drivers={drivers}
        teams={teams}
        followedId="one"
        renderExpanded={(_row, ctx) => {
          seen.ahead = ctx.ahead?.driverId;
          seen.behind = ctx.behind?.driverId;
          return null;
        }}
      />,
    );
    expect(seen).toEqual({ ahead: undefined, behind: 'two' });
  });

  it('defaults the panel to the figures it already has, the car behind included', () => {
    const { container } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} followedId="two" />,
    );
    const figures = [...container.querySelectorAll('[data-slot="timing-tower-figure"]')];
    expect(figures.map((figure) => figure.getAttribute('data-figure'))).toEqual([
      'last',
      'ahead',
      'behind',
      'tyre',
    ]);
    // The gap back to the car behind is that car's interval, not this row's.
    expect(figures[2]).toHaveTextContent('+0.567');
    expect(figures[0]).toHaveTextContent('1:31.512');
  });

  it('shows no gap ahead for the leader and drops the tyre figure with showTyre off', () => {
    const { container } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} followedId="one" showTyre={false} />,
    );
    const figures = [...container.querySelectorAll('[data-slot="timing-tower-figure"]')];
    expect(figures.map((figure) => figure.getAttribute('data-figure'))).toEqual([
      'last',
      'ahead',
      'behind',
    ]);
    expect(figures[1]).toHaveTextContent('—');
  });

  it('keeps the panel on a car that is out of the race', () => {
    const live = [makeRow('one', 1), makeRow('two', 2, { finishStatus: 'dnf' })];
    const { container } = render(
      <TimingTower rows={live} drivers={drivers} teams={teams} followedId="two" />,
    );
    const rendered = [...container.querySelectorAll('[data-slot="timing-tower-row"]')];
    expect(rendered[1]).toHaveAttribute('data-out', 'true');
    expect(rendered[1]).not.toHaveClass('opacity-50');
    expect(rendered[1]?.querySelector('[data-slot="timing-tower-expanded"]')).toBeInTheDocument();
  });

  it('leaves custom rows alone: no button, no panel', () => {
    const { container } = render(
      <TimingTower
        rows={rows}
        drivers={drivers}
        teams={teams}
        followedId="two"
        onRowClick={() => {}}
        renderRow={(row) => <li data-slot="custom-row">{row.driverId}</li>}
      />,
    );
    expect(container.querySelectorAll('[data-slot="timing-tower-row-button"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="timing-tower-expanded"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="custom-row"]')).toHaveLength(3);
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
