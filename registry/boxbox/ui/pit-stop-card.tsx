import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { TyreCompound } from '@/registry/boxbox/lib/types';
import { TYRE_COMPOUND_LABELS, TyreBadge } from '@/registry/boxbox/ui/tyre-badge';
import { cn } from '@/lib/utils';

export type PitStopCardSize = 'sm' | 'md';

// motion owns these props on its own elements, so they cannot come from the caller.
type MotionSafeProps<T extends keyof React.JSX.IntrinsicElements> = Omit<
  React.ComponentProps<T>,
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'style'
>;

/** What a figure nobody measured looks like, so the card keeps its shape. */
const NO_FIGURE = '—';

/**
 * Pit lane time for the board: seconds with one decimal, `22.4`. It is the time from pit entry
 * to pit exit, which is what timing feeds publish — never the stationary time at the box.
 */
export function formatLaneTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return NO_FIGURE;
  return Math.max(0, seconds).toFixed(1);
}

/** A running position as the board prints it: `P3`. */
export function formatPitPosition(position: number | undefined): string {
  return position === undefined ? NO_FIGURE : `P${position}`;
}

/** The compound pair, or nothing when either side is unknown: half a change is not shown. */
function tyreChange(compoundOff: TyreCompound | undefined, compoundOn: TyreCompound | undefined) {
  return compoundOff === undefined || compoundOn === undefined
    ? undefined
    : { off: compoundOff, on: compoundOn };
}

/**
 * The one sentence a screen reader hears, since everything on the card is painted:
 * `EVO pit stop 2, medium tyres off, hard on, pit lane 22.4 seconds, in P3, out P5.` The tyres
 * are left out when either compound is unknown, and `out` until the car has left the lane.
 */
export function pitStopCardLabel({
  code,
  stop,
  laneTime,
  compoundOff,
  compoundOn,
  positionIn,
  positionOut,
}: {
  code: string;
  stop: number;
  laneTime: number;
  compoundOff?: TyreCompound;
  compoundOn?: TyreCompound;
  positionIn: number;
  positionOut?: number;
}): string {
  const parts = [`${code} pit stop ${stop}`];
  const tyres = tyreChange(compoundOff, compoundOn);
  if (tyres) {
    const name = (compound: TyreCompound) => TYRE_COMPOUND_LABELS[compound].toLowerCase();
    parts.push(`${name(tyres.off)} tyres off, ${name(tyres.on)} on`);
  }
  parts.push(`pit lane ${formatLaneTime(laneTime)} seconds`);
  parts.push(`in ${formatPitPosition(positionIn)}`);
  if (positionOut !== undefined) parts.push(`out ${formatPitPosition(positionOut)}`);
  return `${parts.join(', ')}.`;
}

const SIZES: Record<
  PitStopCardSize,
  { root: string; code: string; tag: string; row: string; label: string; figure: string }
> = {
  sm: {
    root: 'min-w-44',
    code: 'text-xs',
    tag: 'text-[0.5rem]',
    row: 'gap-2 px-2.5 py-1.5',
    label: 'text-[0.5rem]',
    figure: 'text-lg',
  },
  md: {
    root: 'min-w-56',
    code: 'text-sm',
    tag: 'text-[0.625rem]',
    row: 'gap-3 px-3 py-2',
    label: 'text-[0.625rem]',
    figure: 'text-2xl',
  },
};

const LABEL_CLASS = 'font-mono uppercase leading-none tracking-widest text-muted-foreground';

/**
 * The broadcast card for one pit stop: the car, which stop it is, the tyres it came in on and
 * went out on, the time in the pit lane and the position in and out.
 *
 * The card is data only, with no clock: to show a stop running, pass the lane time so far and
 * leave `positionOut` out until the car leaves, then pass the final lane time and the position.
 * The position out slides in when it arrives; its space is kept, so the card does not widen.
 *
 * It wipes in when it mounts, so mount it when the car enters the lane. Inside an
 * `AnimatePresence` it wipes out again on removal. Under reduced motion it appears and goes
 * with no wipe, and the position out appears without the slide.
 *
 * The card is not a live region: the lane time changes many times a second, and a live region
 * would read every one of them. A consumer that wants the stop announced should own that.
 */
export function PitStopCard({
  code,
  color,
  stop,
  laneTime,
  compoundOff,
  compoundOn,
  positionIn,
  positionOut,
  size = 'md',
  className,
  ...props
}: {
  /** The car's three-letter code, shown on the plate line. */
  code: string;
  /** Team colour for the bar beside the code. */
  color?: string;
  /** Which stop of the car's race this is: 1 for the first. */
  stop: number;
  /** Seconds in the pit lane, entry to exit; the time so far while the car is still in it. */
  laneTime: number;
  /** The compound the car came in on. The pair shows only when both compounds are known. */
  compoundOff?: TyreCompound;
  /** The compound the car went out on. */
  compoundOn?: TyreCompound;
  /** The car's position as it entered the lane. */
  positionIn: number;
  /** The car's position once out of the lane; unknown, and absent, until it leaves. */
  positionOut?: number;
  size?: PitStopCardSize;
} & MotionSafeProps<'div'>) {
  const reduced = useReducedMotionConfig() ?? false;
  const sizes = SIZES[size];
  const tyres = tyreChange(compoundOff, compoundOn);
  const sentence = pitStopCardLabel({
    code,
    stop,
    laneTime,
    compoundOff,
    compoundOn,
    positionIn,
    positionOut,
  });

  return (
    <motion.div
      data-slot="pit-stop-card"
      data-size={size}
      data-stop={stop}
      data-out={positionOut === undefined ? 'false' : 'true'}
      initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
      animate={{
        clipPath: 'inset(0 0 0 0)',
        transition: { duration: DURATION.base, ease: EASE_OUT },
      }}
      exit={
        reduced
          ? undefined
          : {
              clipPath: 'inset(0 100% 0 0)',
              transition: { duration: DURATION.fast, ease: EASE_OUT },
            }
      }
      className={cn(
        'inline-flex flex-col border border-border bg-card text-card-foreground',
        sizes.root,
        className,
      )}
      {...props}
    >
      <span className="sr-only">{sentence}</span>
      <span
        aria-hidden
        data-slot="pit-stop-card-plate"
        className={cn('flex items-center border-b border-border', sizes.row)}
      >
        <span
          data-slot="pit-stop-card-color"
          className="h-3.5 w-1 shrink-0 bg-current"
          style={color === undefined ? undefined : { backgroundColor: color }}
        />
        <span
          className={cn('font-display font-bold uppercase leading-none tracking-wider', sizes.code)}
        >
          {code}
        </span>
        <span
          data-slot="pit-stop-card-stop"
          className={cn(
            'ml-auto bg-status-pit px-1.5 py-0.5 font-mono font-bold uppercase leading-none tracking-widest text-status-pit-foreground',
            sizes.tag,
          )}
        >
          STOP {stop}
        </span>
      </span>
      <span
        aria-hidden
        data-slot="pit-stop-card-lane"
        className={cn('flex items-center', sizes.row)}
      >
        {tyres && (
          <span data-slot="pit-stop-card-tyres" className="flex items-center gap-1.5">
            <TyreBadge compound={tyres.off} size="sm" />
            <span className={LABEL_CLASS}>→</span>
            <TyreBadge compound={tyres.on} size="sm" />
          </span>
        )}
        <span className={cn('ml-auto', LABEL_CLASS, sizes.label)}>PIT LANE</span>
        {/* Four characters are reserved so 9.9 → 10.0 does not widen the card. */}
        <span
          data-slot="pit-stop-card-lane-time"
          className={cn(
            'min-w-[4ch] text-right font-mono font-bold leading-none tabular-nums',
            sizes.figure,
          )}
        >
          {formatLaneTime(laneTime)}
        </span>
      </span>
      <span
        aria-hidden
        data-slot="pit-stop-card-positions"
        className={cn('flex items-center border-t border-border', sizes.row)}
      >
        <span className={cn(LABEL_CLASS, sizes.label)}>POSITION</span>
        <span
          className={cn(
            'ml-auto flex items-center gap-2 font-mono font-bold leading-none tabular-nums',
            sizes.code,
          )}
        >
          <span data-slot="pit-stop-card-position-in">{formatPitPosition(positionIn)}</span>
          <span className={LABEL_CLASS}>→</span>
          {/* The slot keeps its width while the car is in the lane, so the arrival moves nothing. */}
          <span className="inline-flex min-w-[3ch] justify-end">
            <AnimatePresence initial={false}>
              {positionOut !== undefined && (
                <motion.span
                  key="out"
                  data-slot="pit-stop-card-position-out"
                  initial={reduced ? false : { opacity: 0, transform: 'translateX(-4px)' }}
                  animate={{ opacity: 1, transform: 'translateX(0px)' }}
                  transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                >
                  {formatPitPosition(positionOut)}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </span>
      </span>
    </motion.div>
  );
}
