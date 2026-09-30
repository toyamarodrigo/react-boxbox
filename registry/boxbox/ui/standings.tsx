import { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotionConfig } from 'motion/react';
import { DURATION, EASE_OUT, SPRING_ROW } from '@/registry/boxbox/lib/motion';
import { RollingNumber, type RollingNumberDirection } from '@/registry/boxbox/ui/rolling-number';
import { cn } from '@/lib/utils';

export type StandingsSize = 'sm' | 'md';

/** One line of a championship table: a driver or a team. */
export type StandingsEntry = {
  /** Stable id: the row's key, so a row moves rather than remounts when the order changes. */
  id: string;
  /** What the row shows: a driver's three-letter code or a team's name. */
  name: string;
  /** Team colour for the bar beside the name. */
  color?: string;
  position: number;
  points: number;
  /** Points scored in the race on screen, shown as `+18` when above zero. */
  gained?: number;
  /** Places up (positive) or down (negative) against the standings before the race. */
  positionChange?: number;
};

/** Points as the table prints them: whole points, or one decimal for a half-points race. */
export function formatStandingsPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/** Points scored in the race: `+18`, and nothing at all when the entry scored none. */
export function formatPointsGained(gained: number | undefined): string {
  return gained === undefined || gained <= 0 ? '' : `+${formatStandingsPoints(gained)}`;
}

/** The ▲2 / ▼1 mark for a position change; nothing for a row that held its place. */
export function formatStandingsChange(positionChange: number | undefined): string {
  if (positionChange === undefined || positionChange === 0) return '';
  return `${positionChange > 0 ? '▲' : '▼'}${Math.abs(positionChange)}`;
}

/** The entries in table order. Positions are the caller's, so a tie stays as it was ranked. */
export function sortStandings(entries: readonly StandingsEntry[]): StandingsEntry[] {
  return [...entries].sort((a, b) => a.position - b.position);
}

/**
 * The one sentence a screen reader hears per row, since the mark, the bar and the columns are
 * painted: `P2 EVO, 186 points, 18 in this race, up 1 place.`
 */
export function standingsEntryLabel(entry: StandingsEntry): string {
  const points = formatStandingsPoints(entry.points);
  const parts = [
    `P${entry.position} ${entry.name}`,
    `${points} ${points === '1' ? 'point' : 'points'}`,
  ];
  if (entry.gained !== undefined && entry.gained > 0) {
    parts.push(`${formatStandingsPoints(entry.gained)} in this race`);
  }
  const change = entry.positionChange ?? 0;
  if (change !== 0) {
    const moved = Math.abs(change);
    parts.push(`${change > 0 ? 'up' : 'down'} ${moved} ${moved === 1 ? 'place' : 'places'}`);
  }
  return `${parts.join(', ')}.`;
}

const SIZES: Record<StandingsSize, { row: string; text: string; small: string; bar: string }> = {
  sm: { row: 'gap-2 py-0.5 pr-2', text: 'text-xs', small: 'text-[0.5rem]', bar: 'h-4' },
  md: { row: 'gap-2 py-1 pr-2', text: 'text-sm', small: 'text-[0.625rem]', bar: 'h-6' },
};

/**
 * The points figure. Which way the digits roll is the change itself, so the previous value is kept
 * here rather than asked of the caller; adjusting state during render, so the roll starts on this
 * frame. Under reduced motion the figure is plain text.
 */
function StandingsPoints({ points, reduced }: { points: number; reduced: boolean }) {
  const [seen, setSeen] = useState({ current: points, previous: points });
  if (seen.current !== points) setSeen({ current: points, previous: seen.current });
  const direction: RollingNumberDirection = points < seen.previous ? 'down' : 'up';
  const text = formatStandingsPoints(points);
  return reduced ? (
    <span className="tabular-nums">{text}</span>
  ) : (
    <RollingNumber value={text} direction={direction} />
  );
}

/**
 * One row of the table. The sentence is real text; everything painted is hidden behind it, so a
 * row is read once.
 */
export function StandingsRow({
  entry,
  size = 'md',
  className,
  ...props
}: {
  entry: StandingsEntry;
  size?: StandingsSize;
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const reduced = useReducedMotionConfig() ?? false;
  const sizes = SIZES[size];
  const change = entry.positionChange ?? 0;
  return (
    <div
      data-slot="standings-row-line"
      className={cn('flex items-center', sizes.row, className)}
      {...props}
    >
      <span className="sr-only">{standingsEntryLabel(entry)}</span>
      <span
        aria-hidden
        data-slot="standings-position"
        className={cn(
          'w-7 shrink-0 text-center font-display font-black leading-none tabular-nums',
          sizes.text,
        )}
      >
        {entry.position}
      </span>
      <span
        aria-hidden
        data-slot="standings-color"
        className={cn('w-[3px] shrink-0 bg-muted', sizes.bar)}
        style={entry.color === undefined ? undefined : { backgroundColor: entry.color }}
      />
      <span
        aria-hidden
        data-slot="standings-name"
        className={cn(
          'min-w-0 flex-1 truncate font-display font-bold uppercase leading-none tracking-wider',
          sizes.text,
        )}
      >
        {entry.name}
      </span>
      {/* Fixed slots, so a mark or a figure coming and going never moves the points column. */}
      <span
        aria-hidden
        data-slot="standings-change"
        data-change={change > 0 ? 'gain' : change < 0 ? 'loss' : 'none'}
        className={cn(
          'w-6 shrink-0 text-right font-mono font-bold leading-none tabular-nums',
          sizes.small,
          change > 0 ? 'text-flag-green' : 'text-primary',
        )}
      >
        {formatStandingsChange(change)}
      </span>
      <span
        aria-hidden
        data-slot="standings-gained"
        className={cn(
          'w-8 shrink-0 text-right font-mono leading-none tabular-nums text-muted-foreground',
          sizes.small,
        )}
      >
        {formatPointsGained(entry.gained)}
      </span>
      <span
        aria-hidden
        data-slot="standings-points"
        className={cn(
          'w-12 shrink-0 text-right font-mono font-bold leading-none tabular-nums',
          sizes.text,
        )}
      >
        <StandingsPoints points={entry.points} reduced={reduced} />
      </span>
    </div>
  );
}

/**
 * A championship table, drivers or teams: position, the colour bar, the name, the change of place
 * against the standings before the race (▲2), the points scored in the race (`+18`) and the
 * points.
 *
 * The table is data only: pass the entries ranked, with their positions, and it shows them in that
 * order. When the order changes, rows move to their new places with a spring and the points roll
 * to their new value, so a projected table can be fed on every change of the race order. Under
 * reduced motion the rows and figures change in place.
 *
 * It is an ordered list with one sentence of real text per row. It is not a live region: a
 * projected table can change every few seconds. A consumer that wants a change announced should
 * own that.
 */
export function Standings({
  entries,
  maxRows,
  size = 'md',
  className,
  ...props
}: {
  entries: readonly StandingsEntry[];
  /** Shows the top rows only. */
  maxRows?: number;
  size?: StandingsSize;
} & React.ComponentProps<'ol'>) {
  const reduced = useReducedMotionConfig() ?? false;
  const ordered = sortStandings(entries);
  const shown = maxRows === undefined ? ordered : ordered.slice(0, Math.max(0, maxRows));
  // The rows only measure their layout when the order changes, not on every render.
  const order = shown.map((entry) => entry.id).join(',');

  return (
    <ol
      data-slot="standings"
      data-size={size}
      aria-label="Standings"
      className={cn(
        'relative flex w-64 list-none flex-col border border-border bg-card/90 text-card-foreground',
        className,
      )}
      {...props}
    >
      <LayoutGroup>
        <AnimatePresence mode="popLayout" initial={false}>
          {shown.map((entry) => (
            <motion.li
              key={entry.id}
              layout={reduced ? false : 'position'}
              layoutDependency={order}
              data-slot="standings-row"
              data-id={entry.id}
              data-position={entry.position}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0, transition: { duration: DURATION.fast } }}
              transition={{
                layout: SPRING_ROW,
                opacity: { duration: DURATION.base, ease: EASE_OUT },
              }}
              className="border-b border-border bg-card/90 last:border-b-0"
            >
              <StandingsRow entry={entry} size={size} />
            </motion.li>
          ))}
        </AnimatePresence>
      </LayoutGroup>
    </ol>
  );
}
