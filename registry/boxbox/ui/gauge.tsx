import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { RollingNumberDirection } from '@/registry/boxbox/ui/rolling-number';
import { RollingNumber } from '@/registry/boxbox/ui/rolling-number';
import { cn } from '@/lib/utils';

export type GaugeSize = 'sm' | 'md' | 'lg';

/** A gear the driver can be in: a number, neutral, reverse, or nothing known yet. */
export type GaugeGear = number | 'N' | 'R' | null;

export const GAUGE_MAX = 15_000;
export const GAUGE_REDLINE = 12_000;

/** How much of the circle the arc covers. The rest is the opening at the bottom. */
export const GAUGE_SWEEP = 240;

// The arc lives in a 100×100 viewBox, so one geometry serves every gauge size and only the
// stroke changes with it.
const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKES: Record<GaugeSize, number> = { sm: 9, md: 8, lg: 7 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Where the needle would be: the value as a share of the scale, never outside it. */
export function gaugeFraction(value: number, max: number = GAUGE_MAX): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp(value / max, 0, 1);
}

/**
 * The dash maths for an arc of `sweepDeg` degrees opening at the bottom.
 *
 * `dasharray` is one dash the length of the whole arc followed by a gap longer than the circle,
 * so nothing wraps round the opening; `dashoffset` shortens that dash from its end, which is the
 * one number the arc has to animate. `rotation` turns the circle — which starts at three o'clock
 * — until its start sits at the left end of the arc.
 */
export function gaugeArc(
  fraction: number,
  sweepDeg: number = GAUGE_SWEEP,
): { length: number; dasharray: string; dashoffset: number; rotation: number } {
  const sweep = clamp(sweepDeg, 0, 360);
  const length = (CIRCUMFERENCE * sweep) / 360;
  const filled = length * clamp(fraction, 0, 1);
  return {
    length,
    dasharray: `${length} ${CIRCUMFERENCE}`,
    dashoffset: length - filled,
    rotation: 90 + (360 - sweep) / 2,
  };
}

/** The gear as it is painted: zero is neutral, and nothing known reads as a dash. */
export function formatGear(gear: GaugeGear): string {
  if (gear === null || gear === undefined) return '–';
  if (typeof gear === 'string') return gear;
  if (!Number.isFinite(gear)) return '–';
  const whole = Math.round(gear);
  return whole <= 0 ? 'N' : String(whole);
}

/** Revolutions with a thousands separator, fixed to one locale so it reads the same everywhere. */
export function formatRpm(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

/** The spoken sentence: `Gear 6, 11,200 rpm`, with `, redline` once the engine is past it. */
export function gaugeLabel(
  value: number,
  gear: GaugeGear,
  redline: number = GAUGE_REDLINE,
  label?: string,
): string {
  const name = label ?? 'Gear';
  const gearText = gear === null ? `No ${name.toLowerCase()}` : `${name} ${formatGear(gear)}`;
  const over = Number.isFinite(value) && value >= redline;
  return `${gearText}, ${formatRpm(value)} rpm${over ? ', redline' : ''}`;
}

const ROOT_SIZES: Record<GaugeSize, string> = {
  sm: 'size-16',
  md: 'size-24',
  lg: 'size-32',
};
const GEAR_SIZES: Record<GaugeSize, string> = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
};
const VALUE_SIZES: Record<GaugeSize, string> = {
  sm: 'text-[0.5rem]',
  md: 'text-[0.625rem]',
  lg: 'text-xs',
};

/**
 * The engine widget: revolutions as an arc, the gear in the middle.
 *
 * The arc is one `strokeDashoffset` transition per update and carries no layout or spring, since
 * a gauge is fed many times a second. Past the redline it turns to the destructive colour, so the
 * warning survives reduced motion, where the arc simply jumps to its new length.
 */
export function Gauge({
  value,
  max = GAUGE_MAX,
  redline = GAUGE_REDLINE,
  gear,
  label,
  size = 'md',
  showValue = false,
  className,
  ...props
}: {
  /** Engine speed in revolutions per minute. */
  value: number;
  max?: number;
  /** The revolutions the arc turns red at. */
  redline?: number;
  gear: GaugeGear;
  /** Overrides the spoken word for the gear, for a car that calls it something else. */
  label?: string;
  size?: GaugeSize;
  /** Shows the revolutions as a small figure under the gear. */
  showValue?: boolean;
} & React.ComponentProps<'div'>) {
  const reduced = useReducedMotion();
  // Which way the gear rolls is the shift itself, so the previous one is kept here rather than
  // asked of the caller. Adjusting state during render: the roll must start on this frame.
  const [seen, setSeen] = useState<{ current: GaugeGear; previous: GaugeGear }>({
    current: gear,
    previous: null,
  });
  if (seen.current !== gear) setSeen({ current: gear, previous: seen.current });
  const direction: RollingNumberDirection =
    typeof gear === 'number' && typeof seen.previous === 'number' && gear < seen.previous
      ? 'down'
      : 'up';
  const arc = gaugeArc(gaugeFraction(value, max));
  const over = Number.isFinite(value) && value >= redline;
  const sentence = gaugeLabel(value, gear, redline, label);

  return (
    <div
      data-slot="gauge"
      data-size={size}
      data-gear={formatGear(gear)}
      data-redline={over ? 'true' : undefined}
      className={cn(
        'relative inline-grid shrink-0 place-items-center',
        ROOT_SIZES[size],
        className,
      )}
      {...props}
    >
      <span className="sr-only">{sentence}</span>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full text-primary"
        style={{ transform: `rotate(${arc.rotation}deg)` }}
      >
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeLinecap="round"
          strokeWidth={STROKES[size]}
          strokeDasharray={arc.dasharray}
          className="stroke-muted"
        />
        <motion.circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeLinecap="round"
          strokeWidth={STROKES[size]}
          strokeDasharray={arc.dasharray}
          initial={{ strokeDashoffset: arc.length }}
          animate={{ strokeDashoffset: arc.dashoffset }}
          // Values arrive many times a second, so the arc chases them on the tick duration and
          // stops animating entirely for a visitor who asked for less motion.
          transition={{ duration: reduced ? 0 : DURATION.tick, ease: EASE_OUT }}
          // The redline changes colour, not length, so it transitions on its own.
          className="transition-colors"
          style={{ stroke: over ? 'var(--destructive)' : 'currentColor' }}
        />
      </svg>
      <span
        aria-hidden
        data-slot="gauge-gear"
        className={cn(
          'relative flex flex-col items-center font-display font-bold leading-none',
          GEAR_SIZES[size],
        )}
      >
        {typeof gear === 'number' ? (
          <RollingNumber value={formatGear(gear)} direction={direction} />
        ) : (
          <span>{formatGear(gear)}</span>
        )}
        {showValue && (
          <span
            data-slot="gauge-value"
            className={cn(
              'mt-1 font-mono font-bold leading-none tabular-nums text-muted-foreground',
              VALUE_SIZES[size],
            )}
          >
            {formatRpm(value)}
          </span>
        )}
      </span>
    </div>
  );
}
