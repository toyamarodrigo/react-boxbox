import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { RollingNumberDirection } from '@/registry/boxbox/ui/rolling-number';
import { RollingNumber } from '@/registry/boxbox/ui/rolling-number';
import { cn } from '@/lib/utils';

export type SpeedUnit = 'kph' | 'mph';
export type SpeedTrapSize = 'md' | 'lg';

/** The fastest reading of the session so far: whose it is, and how fast. */
export type SpeedTrapBest = { code: string; speed: number };

/** The painted and spoken unit. The number itself never carries it. */
export const SPEED_UNIT_LABELS: Record<SpeedUnit, string> = { kph: 'km/h', mph: 'mph' };

const MPH_PER_KPH = 0.621371;

/** What a reading nobody took looks like, so the card keeps its shape between traps. */
const NO_READING = '—';

/**
 * A reading rounded for the board. Speeds are given in km/h — that is what timing feeds carry —
 * and `mph` converts, so one figure can be shown in either unit without the caller doing maths.
 */
export function formatSpeed(speed: number | null | undefined, unit: SpeedUnit = 'kph'): string {
  if (speed == null || !Number.isFinite(speed)) return NO_READING;
  return String(Math.round(unit === 'mph' ? speed * MPH_PER_KPH : speed));
}

/**
 * Whether the reading on the card *is* the session best. The best normally already includes it,
 * so equality counts: the card is told "345, best 345" on the lap the record is set. A card with
 * no session best claims nothing — it would otherwise wear the record on every lap.
 */
export function isSessionBest(
  speed: number | null | undefined,
  sessionBest?: SpeedTrapBest | null,
): boolean {
  if (speed == null || !Number.isFinite(speed) || sessionBest == null) return false;
  return speed >= sessionBest.speed;
}

/**
 * The one sentence a screen reader hears, since everything on the card is painted:
 * `EVO 342 km/h, session best MSO 345 km/h`, or `…, new session best` when it is the card's own.
 */
export function speedTrapLabel(
  code: string,
  speed: number | null | undefined,
  unit: SpeedUnit = 'kph',
  sessionBest?: SpeedTrapBest | null,
): string {
  const units = SPEED_UNIT_LABELS[unit];
  if (speed == null || !Number.isFinite(speed)) return `${code}, no speed trap reading`;
  const reading = `${code} ${formatSpeed(speed, unit)} ${units}`;
  if (sessionBest == null) return reading;
  if (isSessionBest(speed, sessionBest)) return `${reading}, new session best`;
  return `${reading}, session best ${sessionBest.code} ${formatSpeed(sessionBest.speed, unit)} ${units}`;
}

const ROOT_SIZES: Record<SpeedTrapSize, string> = { md: 'min-w-40', lg: 'min-w-52' };
const FIGURE_SIZES: Record<SpeedTrapSize, string> = { md: 'text-4xl', lg: 'text-6xl' };
const UNIT_SIZES: Record<SpeedTrapSize, string> = { md: 'text-xs', lg: 'text-sm' };

/** The big number and its unit. Split out so a page can put a trap figure somewhere else. */
export function SpeedTrapFigure({
  speed,
  unit = 'kph',
  direction = 'up',
  size = 'md',
  className,
  ...props
}: {
  speed: number | null;
  unit?: SpeedUnit;
  direction?: RollingNumberDirection;
  size?: SpeedTrapSize;
} & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="speed-trap-figure"
      className={cn(
        'inline-flex items-baseline gap-1.5 font-mono font-bold leading-none tabular-nums',
        FIGURE_SIZES[size],
        className,
      )}
      {...props}
    >
      {/* Three characters are reserved so 99 → 100 does not widen the card. */}
      <RollingNumber
        className="min-w-[3ch] justify-items-end"
        value={formatSpeed(speed, unit)}
        direction={direction}
      />
      <span className={cn('font-display uppercase tracking-wider opacity-60', UNIT_SIZES[size])}>
        {SPEED_UNIT_LABELS[unit]}
      </span>
    </span>
  );
}

/**
 * The broadcast speed trap: one car's reading in big figures, with the session best under it.
 *
 * A reading that *is* the session best flashes once as it lands. The card is a plain region, not
 * a live one: the trap fires every lap for every car, and a live region would talk over the rest
 * of the page. A consumer that wants the record announced should own that announcement.
 */
export function SpeedTrap({
  speed,
  unit = 'kph',
  code,
  color,
  sessionBest,
  label = 'SPEED TRAP',
  size = 'md',
  className,
  ...props
}: {
  /** The reading in km/h, or `null` when the car has not crossed the trap. */
  speed: number | null;
  unit?: SpeedUnit;
  /** The car's three-letter code, shown on the plate line. */
  code: string;
  /** Team colour for the bar beside the code. */
  color?: string;
  sessionBest?: SpeedTrapBest | null;
  label?: string;
  size?: SpeedTrapSize;
} & React.ComponentProps<'div'>) {
  const best = isSessionBest(speed, sessionBest);
  const sentence = speedTrapLabel(code, speed, unit, sessionBest);

  // Which way the digits roll is the change itself, so the previous reading is kept here rather
  // than asked of the caller. Adjusting state during render: the roll must start on this frame.
  const [seen, setSeen] = useState<{ current: number | null; previous: number | null }>({
    current: speed,
    previous: null,
  });
  if (seen.current !== speed) setSeen({ current: speed, previous: seen.current });
  const direction: RollingNumberDirection =
    seen.previous != null && speed != null && speed < seen.previous ? 'down' : 'up';

  const figure = <SpeedTrapFigure speed={speed} unit={unit} direction={direction} size={size} />;

  return (
    <div
      data-slot="speed-trap"
      data-size={size}
      data-unit={unit}
      data-session-best={best ? 'true' : undefined}
      aria-label={sentence}
      className={cn(
        'inline-flex flex-col border border-border bg-card text-card-foreground',
        ROOT_SIZES[size],
        className,
      )}
      {...props}
    >
      <span className="sr-only">{sentence}</span>
      <span
        aria-hidden
        data-slot="speed-trap-plate"
        className="flex items-center gap-2 border-b border-border px-3 py-1.5"
      >
        <span
          data-slot="speed-trap-color"
          className="h-3.5 w-1 shrink-0 bg-current"
          style={color === undefined ? undefined : { backgroundColor: color }}
        />
        <span className="font-display font-bold uppercase leading-none tracking-wider">{code}</span>
        <span className="ml-auto font-mono text-[0.625rem] uppercase leading-none tracking-widest text-muted-foreground">
          {label}
        </span>
      </span>
      <span aria-hidden data-slot="speed-trap-reading" className="px-3 py-2.5">
        {best ? (
          /**
           * The flash brings its own `AnimatePresence` and is keyed on the reading, so every new
           * best plays it once. A card sitting inside an `AnimatePresence initial={false}` — a
           * tower row, a panel — would otherwise have `initial` blocked for anything mounting
           * later, and the one-shot would never run. Under reduced motion the transform is
           * dropped by Motion and the record still reads as the colour change.
           */
          <AnimatePresence>
            <motion.span
              key={speed ?? 'none'}
              className="inline-block text-primary"
              initial={{ opacity: 0.5, transform: 'scale(1.06)' }}
              animate={{ opacity: 1, transform: 'scale(1)' }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
            >
              {figure}
            </motion.span>
          </AnimatePresence>
        ) : (
          <span className="inline-block transition-colors">{figure}</span>
        )}
      </span>
      {sessionBest != null && (
        <span
          aria-hidden
          data-slot="speed-trap-best"
          className="flex items-center gap-2 border-t border-border px-3 py-1.5 font-mono text-[0.625rem] uppercase leading-none tracking-widest"
        >
          <span className="text-muted-foreground">BEST</span>
          <span className="font-bold">{sessionBest.code}</span>
          <span className="ml-auto tabular-nums">{formatSpeed(sessionBest.speed, unit)}</span>
        </span>
      )}
    </div>
  );
}
