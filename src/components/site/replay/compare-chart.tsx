/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the chart is an SVG drawing of the race, not an <img> */
import { memo } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { ChartConfig } from '@/components/ui/chart';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
  type CompareLine,
  compareChartDomain,
  compareChartLabel,
  compareChartRows,
  formatDifference,
} from '@/data/replay-compare';
import { cn } from '@/lib/utils';

const formatTick = (value: number) =>
  value === 0 ? '0' : `${value > 0 ? '+' : '−'}${Math.abs(value)}s`;

/** The code at the end of a line, in the line's colour, where a broadcast would letter it. */
function EndLabel({
  x,
  y,
  code,
  color,
}: {
  x: number | undefined;
  y: number | undefined;
  code: string;
  color: string;
}) {
  if (x === undefined || y === undefined) return null;
  return (
    <text
      data-slot="compare-chart-code"
      x={x + 6}
      y={y}
      dominantBaseline="middle"
      fill={color}
      className="font-mono text-[10px] font-bold"
    >
      {code}
    </text>
  );
}

/**
 * The tooltip: the lap, then every car at it, signed. Its own rather than `ChartTooltipContent`,
 * which prints a bare number and would drop the sign of a car behind.
 */
function CompareTooltip({
  active,
  lap,
  lines,
  row,
}: {
  active: boolean | undefined;
  lap: unknown;
  lines: readonly CompareLine[];
  row: Record<string, unknown> | undefined;
}) {
  if (!active || row === undefined) return null;
  return (
    <div className="grid min-w-[7rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 font-mono text-xs tabular-nums shadow-xl">
      <div className="font-medium">{`Lap ${String(lap)}`}</div>
      {lines.map((line) => {
        const value = row[line.id];
        if (typeof value !== 'number') return null;
        return (
          <div key={line.id} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{line.code}</span>
            <span className="text-foreground">{formatDifference(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The compared drivers' cumulative time difference to the followed driver, lap by lap: the
 * followed car pinned to zero, cars behind it below and cars ahead above, the way the Gap chart
 * hangs the field under the leader.
 *
 * Page-local rather than the `GapChart` item: that one measures gaps to the leader, which are
 * never negative, and draws one car in colour over a muted field, where every line here is in its
 * team's colour, the second car of a team dashed, and ends in its code. Like the Gap chart,
 * nothing animates; the chart is redrawn every time a car completes a lap.
 */
export const CompareChart = memo(function CompareChart({
  lines,
  totalLaps,
  className,
}: {
  /** The followed car first, then the compared ones, their points cut to the race time. */
  lines: readonly CompareLine[];
  totalLaps: number;
  className?: string;
}) {
  const rows = compareChartRows(lines);
  const config: ChartConfig = Object.fromEntries(
    lines.map((line) => [line.id, { label: line.code }]),
  );
  const [followed] = lines;

  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={compareChartLabel(lines, totalLaps)}
      data-slot="compare-chart"
      data-laps={followed?.points.length ?? 0}
      className={cn('aspect-auto h-64 w-full', className)}
    >
      {/* Room on the right for the codes at the ends of the lines. */}
      <LineChart data={rows} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="lap"
          type="number"
          domain={[1, Math.max(1, totalLaps)]}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          // Reversed, so a car behind hangs below the followed car's zero, as on the Gap chart.
          reversed
          domain={compareChartDomain(lines)}
          allowDecimals={false}
          width={48}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={formatTick}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ active, label, payload }) => (
            <CompareTooltip
              active={active}
              lap={label}
              lines={lines}
              row={payload?.[0]?.payload as Record<string, unknown> | undefined}
            />
          )}
        />
        {lines.map((line, index) => {
          const color = line.color ?? 'var(--primary)';
          const last = (line.points.at(-1)?.lap ?? 0) - 1;
          return (
            <Line
              key={line.id}
              dataKey={line.id}
              type="linear"
              stroke={color}
              // The followed car is the reference, so it is the heaviest line.
              strokeWidth={index === 0 ? 2 : 1.5}
              strokeDasharray={line.dashed ? '5 3' : undefined}
              dot={(props) =>
                props.index === last ? (
                  <EndLabel
                    key={props.index}
                    x={props.cx}
                    y={props.cy}
                    code={line.code}
                    color={color}
                  />
                ) : (
                  <g key={props.index} />
                )
              }
              activeDot={{ r: 3 }}
              // A car with no time for a lap leaves a hole; joining across it would invent one.
              connectNulls={false}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ChartContainer>
  );
});
