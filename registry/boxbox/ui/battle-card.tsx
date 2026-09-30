import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { DURATION, EASE_OUT, SPRING_ROW } from '@/registry/boxbox/lib/motion';
import { cn } from '@/lib/utils';

export type BattleCardSize = 'sm' | 'md';

/** Which way the interval is going: the car behind is closing, or the car ahead pulling away. */
export type BattleTrend = 'closing' | 'pulling-away' | 'steady';

/** One car of the battle: what its plate line paints. */
export type BattleCardCar = {
  /** The car's three-letter code; also the key its plate moves by when the two cars swap. */
  code: string;
  /** Team colour for the bar beside the code. */
  color?: string;
};

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

/** A true minus, the width of the plus, the way the tower prints a loss. */
const MINUS = '−';

/**
 * The interval as the Timing Tower prints it: `+0.482`, three decimals under ten seconds and one
 * from there, since a battle's interval is never more than a second and a half at the line.
 */
export function formatBattleInterval(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return NO_FIGURE;
  const abs = Math.max(0, seconds);
  return `+${abs.toFixed(abs >= 10 ? 1 : 3)}`;
}

/** The trend to one decimal, which is all the card shows; a rounded zero is no trend at all. */
function roundedTrend(secondsPerLap: number): number {
  const rounded = Math.round(secondsPerLap * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Which way the interval moves at `secondsPerLap`: shrinking is `closing`, growing is
 * `pulling-away`, and anything that rounds to `0.0` is `steady`.
 */
export function battleTrend(secondsPerLap: number): BattleTrend {
  const rounded = roundedTrend(secondsPerLap);
  if (rounded < 0) return 'closing';
  if (rounded > 0) return 'pulling-away';
  return 'steady';
}

/** The trend for the board, per lap: `−0.3 s/lap` closing, `+0.2 s/lap` pulling away. */
export function formatBattleTrend(secondsPerLap: number | null | undefined): string {
  if (secondsPerLap === null || secondsPerLap === undefined || !Number.isFinite(secondsPerLap)) {
    return NO_FIGURE;
  }
  const rounded = roundedTrend(secondsPerLap);
  const sign = rounded < 0 ? MINUS : rounded > 0 ? '+' : '';
  return `${sign}${Math.abs(rounded).toFixed(1)} s/lap`;
}

/** The words for a trend, so the sentence says which car the time is going to. */
function trendWords(secondsPerLap: number): string {
  const trend = battleTrend(secondsPerLap);
  if (trend === 'steady') return 'interval steady';
  const amount = Math.abs(roundedTrend(secondsPerLap)).toFixed(1);
  return `${trend === 'closing' ? 'closing' : 'pulling away'} ${amount} seconds a lap`;
}

/**
 * The one sentence a screen reader hears, since everything on the card is painted:
 * `Battle for P3, EVO ahead of MSO, interval 0.482 seconds, closing 0.3 seconds a lap.` Right
 * after a pass it says who overtook whom; the interval and the trend are left out when unknown.
 */
export function battleCardLabel({
  position,
  ahead,
  behind,
  interval,
  trend,
  overtake = false,
}: {
  position: number;
  ahead: BattleCardCar;
  behind: BattleCardCar;
  interval?: number | null;
  trend?: number | null;
  overtake?: boolean;
}): string {
  const parts = [
    `Battle for P${position}`,
    overtake ? `${ahead.code} overtook ${behind.code}` : `${ahead.code} ahead of ${behind.code}`,
  ];
  const figure = formatBattleInterval(interval);
  if (figure !== NO_FIGURE) parts.push(`interval ${figure.slice(1)} seconds`);
  if (trend !== null && trend !== undefined && Number.isFinite(trend)) {
    parts.push(trendWords(trend));
  }
  return `${parts.join(', ')}.`;
}

const SIZES: Record<
  BattleCardSize,
  {
    root: string;
    row: string;
    header: string;
    tag: string;
    code: string;
    label: string;
    figure: string;
  }
> = {
  sm: {
    root: 'min-w-44',
    row: 'gap-2 px-2.5 py-1',
    header: 'h-6',
    tag: 'text-[0.5rem]',
    code: 'text-xs',
    label: 'text-[0.5rem]',
    figure: 'text-lg',
  },
  md: {
    root: 'min-w-56',
    row: 'gap-3 px-3 py-1.5',
    header: 'h-7',
    tag: 'text-[0.625rem]',
    code: 'text-sm',
    label: 'text-[0.625rem]',
    figure: 'text-2xl',
  },
};

const LABEL_CLASS = 'font-mono uppercase leading-none tracking-widest text-muted-foreground';

/**
 * The broadcast card for one battle: the two cars one place apart, the car ahead on top, the
 * interval between them and which way it is going.
 *
 * The card is data only. `position` is the place the two are fighting over, so the car ahead
 * holds it and the car behind is one place back. `trend` is the interval's change per lap, in
 * seconds: negative while the car behind closes, positive while the car ahead pulls away. Leave it
 * out when there is nothing to measure it over. `overtake` tags the card `OVERTAKE`; the consumer
 * says for how long.
 *
 * It wipes in when it mounts, so mount it when the battle starts, and key it per battle so a new
 * one wipes in again. Inside an `AnimatePresence` it wipes out on removal. When the two cars swap,
 * their plates trade places with a spring while the positions stay put. Under reduced motion the
 * card appears, swaps and goes with no motion at all.
 *
 * The card is not a live region: the interval changes every second. A consumer that wants a pass
 * announced should own that.
 */
export function BattleCard({
  position,
  ahead,
  behind,
  interval,
  trend,
  overtake = false,
  size = 'md',
  className,
  ...props
}: {
  /** The place the two cars are fighting over: the car ahead's position. */
  position: number;
  /** The car in front. */
  ahead: BattleCardCar;
  /** The car one place behind it. */
  behind: BattleCardCar;
  /** Seconds between the two, the car behind's interval. */
  interval?: number | null;
  /** The interval's change per lap in seconds: negative is closing, positive pulling away. */
  trend?: number | null;
  /** Tags the card `OVERTAKE`, for a pass that has just happened. */
  overtake?: boolean;
  size?: BattleCardSize;
} & MotionSafeProps<'div'>) {
  const reduced = useReducedMotionConfig() ?? false;
  const sizes = SIZES[size];
  const hasTrend = trend !== null && trend !== undefined && Number.isFinite(trend);
  const sentence = battleCardLabel({ position, ahead, behind, interval, trend, overtake });

  return (
    <motion.div
      data-slot="battle-card"
      data-size={size}
      data-position={position}
      data-overtake={overtake ? 'true' : 'false'}
      data-trend={hasTrend ? battleTrend(trend) : undefined}
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
      {/* A fixed height, so the tag coming and going never moves the rows under it. */}
      <span
        aria-hidden
        data-slot="battle-card-header"
        className={cn('flex items-center border-b border-border', sizes.row, sizes.header)}
      >
        <span className={cn(LABEL_CLASS, sizes.label)}>BATTLE</span>
        <AnimatePresence initial={false}>
          {overtake && (
            <motion.span
              key="overtake"
              data-slot="battle-card-overtake"
              initial={reduced ? false : { opacity: 0, transform: 'translateX(4px)' }}
              animate={{ opacity: 1, transform: 'translateX(0px)' }}
              exit={reduced ? undefined : { opacity: 0, transition: { duration: DURATION.fast } }}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
              className={cn(
                'ml-auto bg-primary px-1.5 py-0.5 font-mono font-bold uppercase leading-none tracking-widest text-primary-foreground',
                sizes.tag,
              )}
            >
              OVERTAKE
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span aria-hidden data-slot="battle-card-cars" className="flex">
        {/* The positions belong to the places, not the cars, so they stay while the cars swap. */}
        <span className="flex flex-col">
          {[position, position + 1].map((place) => (
            <span
              key={place}
              data-slot="battle-card-position"
              className={cn(
                'flex items-center font-mono font-bold leading-none tabular-nums text-muted-foreground',
                sizes.row,
                sizes.code,
              )}
            >
              P{place}
            </span>
          ))}
        </span>
        <span className="flex flex-1 flex-col">
          {[ahead, behind].map((car) => (
            <motion.span
              key={car.code}
              layout={reduced ? false : 'position'}
              transition={SPRING_ROW}
              data-slot="battle-card-car"
              data-code={car.code}
              className={cn('flex items-center', sizes.row)}
            >
              <span
                data-slot="battle-card-color"
                className="h-3.5 w-1 shrink-0 bg-current"
                style={car.color === undefined ? undefined : { backgroundColor: car.color }}
              />
              <span
                className={cn(
                  'font-display font-bold uppercase leading-none tracking-wider',
                  sizes.code,
                )}
              >
                {car.code}
              </span>
            </motion.span>
          ))}
        </span>
      </span>
      <span
        aria-hidden
        data-slot="battle-card-interval"
        className={cn('flex items-center border-t border-border', sizes.row)}
      >
        <span className={cn(LABEL_CLASS, sizes.label)}>INTERVAL</span>
        {/* Six characters are reserved so a figure that grows a digit does not widen the card. */}
        <span
          data-slot="battle-card-interval-figure"
          className={cn(
            'ml-auto min-w-[6ch] text-right font-mono font-bold leading-none tabular-nums',
            sizes.figure,
          )}
        >
          {formatBattleInterval(interval)}
        </span>
      </span>
      <span
        aria-hidden
        data-slot="battle-card-trend"
        className={cn('flex items-center', sizes.row)}
      >
        <span className={cn(LABEL_CLASS, sizes.label)}>TREND</span>
        <span
          data-slot="battle-card-trend-figure"
          className={cn(
            'ml-auto font-mono font-bold leading-none tabular-nums text-muted-foreground',
            sizes.tag,
          )}
        >
          {hasTrend ? formatBattleTrend(trend) : NO_FIGURE}
        </span>
      </span>
    </motion.div>
  );
}
