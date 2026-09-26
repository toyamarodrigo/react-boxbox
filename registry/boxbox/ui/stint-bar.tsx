import { DURATION, EASE_IN_OUT } from '@/registry/boxbox/lib/motion';
import type { TyreCompound } from '@/registry/boxbox/lib/types';
import { cn } from '@/lib/utils';

export type StintBarSize = 'sm' | 'md';

/** One set of tyres over a run of laps, both ends included. No compound draws as unknown. */
export type StintBarStint = {
  compound?: TyreCompound | null;
  fromLap: number;
  toLap: number;
};

/** Spoken compound names, so the summary sentence reads as words rather than letters. */
export const STINT_COMPOUND_NAMES: Record<TyreCompound, string> = {
  S: 'soft',
  M: 'medium',
  H: 'hard',
  I: 'intermediate',
  W: 'wet',
};

const SEGMENT_COLORS: Record<TyreCompound, string> = {
  S: 'bg-tyre-soft text-tyre-soft-foreground',
  M: 'bg-tyre-medium text-tyre-medium-foreground',
  H: 'bg-tyre-hard text-tyre-hard-foreground',
  I: 'bg-tyre-inter text-tyre-inter-foreground',
  W: 'bg-tyre-wet text-tyre-wet-foreground',
};

/** A set nobody recorded: neutral, and never mistakable for a compound colour. */
const UNKNOWN_COLOR = 'bg-muted-foreground/40 text-foreground';

const HEIGHTS: Record<StintBarSize, string> = { sm: 'h-1.5', md: 'h-2.5' };

/**
 * Laps a segment needs before its compound letter fits. Counted in laps rather than measured:
 * the bar is as wide as its container, and a `ResizeObserver` per stint to decide whether one
 * character fits would cost more than the character is worth.
 */
export const STINT_BAR_WIDE_LAPS = 6;

/** The shared movement curve as a CSS one: the fill edge is a transition, not a motion value. */
const FILL_EASE = `cubic-bezier(${EASE_IN_OUT.join(', ')})`;

const floor = (value: number) => Math.floor(value);

/** A stint's laps, tidied: whole numbers, starting at lap one, never ending before it starts. */
function stintRange(stint: StintBarStint): { from: number; to: number } {
  const from = Math.max(1, floor(stint.fromLap));
  return { from, to: Math.max(from, floor(stint.toLap)) };
}

/**
 * How many of a stint's laps have been run at `currentLap`: its whole length without one, and
 * zero once the stint is entirely in the future.
 */
export function stintSpan(stint: StintBarStint, currentLap?: number): number {
  const { from, to } = stintRange(stint);
  const last = currentLap === undefined ? to : Math.min(to, floor(currentLap));
  return Math.max(0, last - from + 1);
}

/**
 * The sentence a screen reader hears, since the bar itself is colour and nothing else:
 * `3 stints: medium laps 1–18, hard laps 19–40, soft laps 41–57`. With a `currentLap` it
 * describes the race so far, so it never reads out a strategy the viewer cannot see yet.
 */
export function stintBarLabel(
  stints: readonly StintBarStint[],
  totalLaps: number,
  currentLap?: number,
): string {
  const parts: string[] = [];
  for (const stint of stints) {
    const run = stintSpan(stint, currentLap);
    if (run === 0) continue;
    const { from } = stintRange(stint);
    const compound = stint.compound ?? null;
    const name = compound === null ? 'unknown compound' : STINT_COMPOUND_NAMES[compound];
    const to = from + run - 1;
    parts.push(`${name} ${from === to ? `lap ${from}` : `laps ${from}–${to}`}`);
  }
  if (parts.length === 0) return `No stints in ${totalLaps} laps`;
  return `${parts.length} ${parts.length === 1 ? 'stint' : 'stints'}: ${parts.join(', ')}`;
}

/**
 * One stint of the bar. It is placed on the track by lap, so a car whose stints do not cover
 * every lap — a retirement, a missing lap in the source — leaves the rest of the track empty
 * rather than stretching to fill it.
 */
export function StintBarSegment({
  stint,
  totalLaps,
  size = 'md',
  className,
  ...props
}: {
  stint: StintBarStint;
  /** The length of the track the segment sits on, so it cannot run off the end of it. */
  totalLaps?: number;
  size?: StintBarSize;
} & React.ComponentProps<'span'>) {
  const { from, to } = stintRange(stint);
  const last = totalLaps === undefined ? to : Math.min(to, Math.max(1, floor(totalLaps)));
  const laps = Math.max(1, last - from + 1);
  const compound = stint.compound ?? null;
  // `sm` is six pixels tall: there is no room for a character, at any width.
  const wide = size === 'md' && laps >= STINT_BAR_WIDE_LAPS;

  return (
    <span
      data-slot="stint-bar-segment"
      data-compound={compound ?? 'unknown'}
      data-laps={laps}
      data-wide={wide ? 'true' : undefined}
      title={compound === null ? 'compound unknown' : undefined}
      style={{ gridColumn: `${from} / span ${laps}` }}
      className={cn(
        'grid place-items-center overflow-hidden font-display text-[0.5rem] font-bold leading-none',
        compound === null ? UNKNOWN_COLOR : SEGMENT_COLORS[compound],
        className,
      )}
      {...props}
    >
      {wide && <span aria-hidden>{compound ?? '?'}</span>}
    </span>
  );
}

/**
 * A car's tyre strategy as one bar: the race is the whole track, each stint a segment of it in
 * its compound colour.
 *
 * With `currentLap` the bar fills up to that lap and the rest reads as laps still to come, so
 * the strategy unfolds with the race instead of giving the result away. The fill edge is a CSS
 * transition of a clip over the future, which keeps a bar per car cheap when twenty of them
 * update together.
 */
export function StintBar({
  stints,
  totalLaps,
  currentLap,
  size = 'md',
  label,
  className,
  ...props
}: {
  stints: readonly StintBarStint[];
  totalLaps: number;
  /** The lap the car is on. Without it the whole strategy is shown. */
  currentLap?: number;
  size?: StintBarSize;
  /** Overrides the spoken summary. */
  label?: string;
} & React.ComponentProps<'div'>) {
  const laps = Math.max(1, floor(totalLaps));
  const shown = stints.filter((stint) => stintRange(stint).from <= laps);
  const run = currentLap === undefined ? laps : Math.min(Math.max(0, floor(currentLap)), laps);
  const filled = Math.round((run / laps) * 10_000) / 100;

  return (
    <div
      data-slot="stint-bar"
      data-size={size}
      data-total-laps={laps}
      data-current-lap={currentLap === undefined ? undefined : run}
      className={cn('relative w-full overflow-hidden bg-muted', HEIGHTS[size], className)}
      {...props}
    >
      <span
        aria-hidden
        data-slot="stint-bar-track"
        className="grid h-full w-full"
        style={{ gridTemplateColumns: `repeat(${laps}, minmax(0, 1fr))` }}
      >
        {shown.map((stint) => (
          <StintBarSegment
            key={`${stint.fromLap}:${stint.toLap}`}
            stint={stint}
            totalLaps={laps}
            size={size}
          />
        ))}
      </span>
      {currentLap !== undefined && (
        <span
          aria-hidden
          data-slot="stint-bar-future"
          // The laps still to come are covered rather than unpainted, so the edge can move as a
          // transition of one clip instead of every segment changing width.
          className="absolute inset-0 bg-muted transition-[clip-path] motion-reduce:transition-none"
          style={{
            clipPath: `inset(0 0 0 ${filled}%)`,
            transitionDuration: `${DURATION.base * 1000}ms`,
            transitionTimingFunction: FILL_EASE,
          }}
        />
      )}
      <span className="sr-only">{label ?? stintBarLabel(stints, laps, currentLap)}</span>
    </div>
  );
}
