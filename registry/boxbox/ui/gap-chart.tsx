/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the chart is an SVG drawing of the race, not an <img> */
import { memo } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { ChartConfig } from '@/components/ui/chart';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

/**
 * One car's race as a line. `gaps[i]` is how many seconds behind the leader the car was after
 * lap `i + 1`; `null` is a lap the car has no comparable time for — it was out, or the source
 * never timed it — and breaks the line rather than joining across it.
 */
export type GapChartSeries = {
  id: string;
  code: string;
  /** The car's colour, used only when it is the emphasised one. */
  color?: string;
  gaps: readonly (number | null)[];
};

/** A row of the chart: `lap` plus one gap per car, keyed by car id. */
export type GapChartRow = Record<string, number | null>;

/** How many cars the tooltip names at once. Twenty rows under the pointer is a wall of text. */
export const GAP_CHART_TOOLTIP_ROWS = 6;

const clampLap = (value: number) => Math.max(0, Math.floor(value));

/**
 * How many laps the chart draws: the whole race, or the laps run so far when the caller passes a
 * `currentLap`. Nothing past the flag, and never a negative lap.
 */
export function gapChartLaps(totalLaps: number, currentLap?: number): number {
  const total = clampLap(totalLaps);
  return currentLap === undefined ? total : Math.min(total, clampLap(currentLap));
}

/**
 * Every series cut to the laps already run, so the chart grows with the race clock instead of
 * showing the viewer an ending they have not reached.
 */
export function clipSeries(
  series: readonly GapChartSeries[],
  totalLaps: number,
  currentLap?: number,
): GapChartSeries[] {
  const laps = gapChartLaps(totalLaps, currentLap);
  return series.map((car) => ({ ...car, gaps: car.gaps.slice(0, laps) }));
}

/**
 * The series turned into the one row per lap Recharts draws from. Gaps are rounded to a tenth,
 * which is the precision timing is read at and all the tooltip should print.
 *
 * `lap` is the x key, so a car whose id is `lap` would collide with it. No grid has one.
 */
export function gapChartRows(series: readonly GapChartSeries[], laps: number): GapChartRow[] {
  const rows: GapChartRow[] = [];
  for (let lap = 1; lap <= clampLap(laps); lap++) {
    const row: GapChartRow = { lap };
    for (const car of series) {
      const gap = car.gaps[lap - 1];
      row[car.id] = gap === undefined || gap === null ? null : Math.round(gap * 10) / 10;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The y range, leader to last: always anchored at zero, and at least a second tall so a field
 * running nose to tail does not draw on a flat line.
 */
export function gapChartDomain(series: readonly GapChartSeries[]): [number, number] {
  let largest = 0;
  for (const car of series) {
    for (const gap of car.gaps) {
      if (gap !== null && gap > largest) largest = gap;
    }
  }
  return [0, Math.max(1, Math.ceil(largest))];
}

/**
 * The sentence a screen reader hears, since the chart is twenty lines and nothing else: how much
 * of the race is drawn, how many cars are on it, and where the emphasised car stands at the last
 * lap shown.
 */
export function gapChartLabel(
  series: readonly GapChartSeries[],
  totalLaps: number,
  currentLap?: number,
  emphasisedId?: string,
): string {
  const laps = gapChartLaps(totalLaps, currentLap);
  const total = clampLap(totalLaps);
  if (laps === 0) return `Gap to the leader. No laps completed of ${total}.`;

  const scope = laps === total ? `all ${total} laps` : `${laps} of ${total} laps`;
  const head = `Gap to the leader over ${scope}, ${series.length} ${series.length === 1 ? 'car' : 'cars'}.`;

  const emphasised = series.find((car) => car.id === emphasisedId);
  if (!emphasised) return head;
  const gap = emphasised.gaps[laps - 1];
  if (gap === undefined || gap === null)
    return `${head} ${emphasised.code} has no gap at lap ${laps}.`;
  if (gap === 0) return `${head} ${emphasised.code} leads at lap ${laps}.`;
  return `${head} ${emphasised.code} ${gap.toFixed(1)} seconds behind at lap ${laps}.`;
}

/**
 * The cars the tooltip names at one lap: the emphasised one first because it is the one being
 * watched, then whoever is nearest the leader. Cars with no time at that lap drop out.
 */
export function gapChartTooltipRows<T extends { dataKey?: unknown; value?: unknown }>(
  payload: readonly T[] | undefined,
  emphasisedId?: string,
  limit: number = GAP_CHART_TOOLTIP_ROWS,
): T[] {
  const timed = (payload ?? []).filter((row) => typeof row.value === 'number');
  const byGap = [...timed].sort((a, b) => Number(a.value) - Number(b.value));
  return [
    ...byGap.filter((row) => row.dataKey === emphasisedId),
    ...byGap.filter((row) => row.dataKey !== emphasisedId),
  ].slice(0, Math.max(1, limit));
}

const formatGapTick = (value: number) => (value === 0 ? '0' : `+${value}s`);

/**
 * The race as gaps to the leader: laps across, seconds behind down, and the leader pinned to zero
 * along the top the way a broadcast draws it.
 *
 * Every car is a thin muted line and the emphasised one is drawn last, in its own colour, on top;
 * with `currentLap` the lines stop at the lap the race has reached. Nothing here animates: the
 * chart is redrawn whenever a car completes a lap, and a line that redraws itself from the left
 * on every one of those reads as a glitch rather than as motion.
 */
export const GapChart = memo(function GapChart({
  series,
  totalLaps,
  currentLap,
  emphasisedId,
  onSeriesClick,
  label,
  className,
  ...props
}: {
  series: readonly GapChartSeries[];
  totalLaps: number;
  /** The last lap to draw. Without it the whole race is drawn. */
  currentLap?: number;
  /** The car drawn in colour, over the rest of the field. */
  emphasisedId?: string;
  /** Called with the car id when one of its lines is clicked. */
  onSeriesClick?: (id: string) => void;
  /** Overrides the spoken summary. */
  label?: string;
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const laps = gapChartLaps(totalLaps, currentLap);
  const shown = clipSeries(series, totalLaps, currentLap);
  const rows = gapChartRows(shown, laps);
  const config: ChartConfig = Object.fromEntries(
    series.map((car) => [car.id, { label: car.code }]),
  );
  // Painter's order: the field first, the emphasised car last so it is never drawn over.
  const ordered = [
    ...shown.filter((car) => car.id !== emphasisedId),
    ...shown.filter((car) => car.id === emphasisedId),
  ];

  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={label ?? gapChartLabel(series, totalLaps, currentLap, emphasisedId)}
      data-slot="gap-chart"
      data-laps={laps}
      data-emphasised={emphasisedId}
      className={cn('aspect-auto h-64 w-full', className)}
      {...props}
    >
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="lap"
          type="number"
          domain={[1, Math.max(1, clampLap(totalLaps))]}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          // Reversed, so the leader's zero sits along the top and the field hangs below it.
          reversed
          domain={gapChartDomain(shown)}
          width={48}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={formatGapTick}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: '3 3' }}
          // Only the three props the content reads are passed on: the rest of a Recharts tooltip
          // carries a `content` of its own, which is what is being replaced here.
          content={({ active, label: lap, payload }) => (
            <ChartTooltipContent
              active={active}
              label={lap}
              payload={gapChartTooltipRows(payload, emphasisedId)}
              labelFormatter={(value) => `Lap ${value}`}
              className="font-mono tabular-nums"
            />
          )}
        />
        {ordered.map((car) => {
          const emphasised = car.id === emphasisedId;
          return (
            <Line
              key={car.id}
              dataKey={car.id}
              type="linear"
              stroke={emphasised ? (car.color ?? 'var(--primary)') : 'var(--muted-foreground)'}
              strokeWidth={emphasised ? 2 : 1}
              strokeOpacity={emphasised ? 1 : emphasisedId === undefined ? 0.45 : 0.2}
              dot={false}
              activeDot={emphasised ? { r: 3 } : false}
              // A car with no time for a lap leaves a hole; joining across it would invent one.
              connectNulls={false}
              isAnimationActive={false}
              className={cn(onSeriesClick && 'cursor-pointer')}
              onClick={onSeriesClick === undefined ? undefined : () => onSeriesClick(car.id)}
            />
          );
        })}
      </LineChart>
    </ChartContainer>
  );
});
