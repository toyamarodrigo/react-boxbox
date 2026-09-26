import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { stubElementSize } from '@/test/chart-size';
import {
  GapChart,
  type GapChartSeries,
  clipSeries,
  gapChartDomain,
  gapChartLabel,
  gapChartLaps,
  gapChartRows,
  gapChartTooltipRows,
} from '@/registry/boxbox/ui/gap-chart';

/** Three cars over five laps. Charlie has no time for the last two: it is out of the race. */
const SERIES: GapChartSeries[] = [
  { id: 'alpha', code: 'ALP', gaps: [0, 0, 0, 0, 0] },
  { id: 'bravo', code: 'BRA', color: '#0000ff', gaps: [1.2, 0.8, 2.4, 3.1, 2.9] },
  { id: 'charlie', code: 'CHA', gaps: [4.5, null, 9.75, null, null] },
];

const lines = () => [...document.querySelectorAll('.recharts-line')];

describe('gapChartLaps', () => {
  it('draws the whole race without a current lap and the race so far with one', () => {
    expect(gapChartLaps(57)).toBe(57);
    expect(gapChartLaps(57, 22)).toBe(22);
    expect(gapChartLaps(57, 99)).toBe(57);
    expect(gapChartLaps(57, 0)).toBe(0);
    expect(gapChartLaps(57, -4)).toBe(0);
    expect(gapChartLaps(57.8, 22.6)).toBe(22);
  });
});

describe('clipSeries', () => {
  it('cuts every car to the laps run so far', () => {
    expect(clipSeries(SERIES, 5, 3).map((car) => car.gaps)).toEqual([
      [0, 0, 0],
      [1.2, 0.8, 2.4],
      [4.5, null, 9.75],
    ]);
  });

  it('keeps the whole race without a current lap and leaves the input alone', () => {
    expect(clipSeries(SERIES, 5)[1]?.gaps).toEqual([1.2, 0.8, 2.4, 3.1, 2.9]);
    expect(clipSeries(SERIES, 5, 0).every((car) => car.gaps.length === 0)).toBe(true);
    expect(SERIES[1]?.gaps).toHaveLength(5);
  });
});

describe('gapChartRows', () => {
  it('builds one row per lap, keyed by car, rounded to a tenth', () => {
    expect(gapChartRows(SERIES, 3)).toEqual([
      { lap: 1, alpha: 0, bravo: 1.2, charlie: 4.5 },
      { lap: 2, alpha: 0, bravo: 0.8, charlie: null },
      { lap: 3, alpha: 0, bravo: 2.4, charlie: 9.8 },
    ]);
  });

  it('reads a lap past the end of a car’s gaps as no time at all', () => {
    expect(gapChartRows([{ id: 'alpha', code: 'ALP', gaps: [0] }], 2)).toEqual([
      { lap: 1, alpha: 0 },
      { lap: 2, alpha: null },
    ]);
  });
});

describe('gapChartDomain', () => {
  it('anchors at zero and reaches past the biggest gap', () => {
    expect(gapChartDomain(SERIES)).toEqual([0, 10]);
    expect(gapChartDomain(clipSeries(SERIES, 5, 2))).toEqual([0, 5]);
  });

  it('is a second tall for a field running nose to tail', () => {
    expect(gapChartDomain([{ id: 'a', code: 'A', gaps: [0, 0.2] }])).toEqual([0, 1]);
    expect(gapChartDomain([])).toEqual([0, 1]);
  });
});

describe('gapChartLabel', () => {
  it('says how much of the race is drawn and by how many cars', () => {
    expect(gapChartLabel(SERIES, 5)).toBe('Gap to the leader over all 5 laps, 3 cars.');
    expect(gapChartLabel(SERIES, 5, 3)).toBe('Gap to the leader over 3 of 5 laps, 3 cars.');
  });

  it('says nothing has been run yet before the first lap is complete', () => {
    expect(gapChartLabel(SERIES, 5, 0)).toBe('Gap to the leader. No laps completed of 5.');
  });

  it('places the emphasised car at the last lap shown', () => {
    expect(gapChartLabel(SERIES, 5, 3, 'bravo')).toBe(
      'Gap to the leader over 3 of 5 laps, 3 cars. BRA 2.4 seconds behind at lap 3.',
    );
    expect(gapChartLabel(SERIES, 5, 3, 'alpha')).toBe(
      'Gap to the leader over 3 of 5 laps, 3 cars. ALP leads at lap 3.',
    );
    expect(gapChartLabel(SERIES, 5, 2, 'charlie')).toBe(
      'Gap to the leader over 2 of 5 laps, 3 cars. CHA has no gap at lap 2.',
    );
  });

  it('ignores an id no car carries', () => {
    expect(gapChartLabel(SERIES, 5, 3, 'nobody')).toBe(
      'Gap to the leader over 3 of 5 laps, 3 cars.',
    );
  });
});

describe('gapChartTooltipRows', () => {
  const payload = [
    { dataKey: 'alpha', value: 0 },
    { dataKey: 'bravo', value: 2.4 },
    { dataKey: 'charlie', value: null },
    { dataKey: 'delta', value: 1.1 },
  ];

  it('drops cars with no time and orders the rest by gap', () => {
    expect(gapChartTooltipRows(payload).map((row) => row.dataKey)).toEqual([
      'alpha',
      'delta',
      'bravo',
    ]);
  });

  it('puts the emphasised car first, whatever its gap', () => {
    expect(gapChartTooltipRows(payload, 'bravo').map((row) => row.dataKey)).toEqual([
      'bravo',
      'alpha',
      'delta',
    ]);
  });

  it('caps the list and copes with no payload at all', () => {
    expect(gapChartTooltipRows(payload, undefined, 2).map((row) => row.dataKey)).toEqual([
      'alpha',
      'delta',
    ]);
    expect(gapChartTooltipRows(undefined)).toEqual([]);
  });
});

describe('GapChart', () => {
  let restoreSize: () => void;
  beforeEach(() => {
    restoreSize = stubElementSize();
  });
  afterEach(() => restoreSize());

  it('draws one line per car and speaks the race so far', () => {
    render(<GapChart series={SERIES} totalLaps={5} />);

    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('data-slot', 'gap-chart');
    expect(chart).toHaveAttribute('data-laps', '5');
    expect(chart).toHaveAccessibleName('Gap to the leader over all 5 laps, 3 cars.');
    expect(lines()).toHaveLength(3);
  });

  it('clips to the current lap, so it never shows an ending yet to come', () => {
    const { rerender } = render(<GapChart series={SERIES} totalLaps={5} currentLap={2} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-laps', '2');
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Gap to the leader over 2 of 5 laps, 3 cars.',
    );

    rerender(<GapChart series={SERIES} totalLaps={5} currentLap={5} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-laps', '5');
  });

  it('draws nothing but the axes before the first lap is complete', () => {
    render(<GapChart series={SERIES} totalLaps={5} currentLap={0} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Gap to the leader. No laps completed of 5.',
    );
  });

  it('draws the emphasised car last, in its colour, over a muted field', () => {
    render(<GapChart series={SERIES} totalLaps={5} emphasisedId="bravo" />);

    expect(screen.getByRole('img')).toHaveAttribute('data-emphasised', 'bravo');
    const strokes = lines().map((line) => line.querySelector('path')?.getAttribute('stroke'));
    expect(strokes).toEqual(['var(--muted-foreground)', 'var(--muted-foreground)', '#0000ff']);
  });

  it('breaks a line where a car has no time rather than joining across it', () => {
    // One hole on lap two, so the line is drawn as two subpaths rather than one straight join.
    render(
      <GapChart
        series={[{ id: 'charlie', code: 'CHA', gaps: [1, null, 3, 4, 5] }]}
        totalLaps={5}
      />,
    );
    const drawn = lines()[0]?.querySelector('path')?.getAttribute('d') ?? '';
    expect(drawn.match(/M/g)).toHaveLength(2);
  });

  it('reports the car whose line is clicked', () => {
    const onSeriesClick = vi.fn();
    render(<GapChart series={SERIES} totalLaps={5} onSeriesClick={onSeriesClick} />);

    // Recharts puts a line's own handlers on its curve, which is the line the viewer sees.
    fireEvent.click(document.querySelectorAll('.recharts-line-curve')[0]!);
    expect(onSeriesClick).toHaveBeenCalledWith('alpha');
  });

  it('takes an overriding label and a class name', () => {
    render(<GapChart series={SERIES} totalLaps={5} label="Gaps, Aster Park" className="h-40" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Gaps, Aster Park');
    expect(screen.getByRole('img')).toHaveClass('h-40');
  });
});
