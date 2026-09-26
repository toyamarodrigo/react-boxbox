/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the counter is a live region on a div, not a form output */
import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import { RollingNumber } from '@/registry/boxbox/ui/rolling-number';
import { cn } from '@/lib/utils';

export type LapCounterSize = 'sm' | 'md' | 'lg';

const ROOT_SIZES: Record<LapCounterSize, string> = {
  sm: 'gap-2 px-2 py-1',
  md: 'gap-3 px-3 py-1.5',
  lg: 'gap-4 px-4 py-2',
};

const LABEL_SIZES: Record<LapCounterSize, string> = {
  sm: 'text-[0.625rem]',
  md: 'text-xs',
  lg: 'text-sm',
};

const VALUE_SIZES: Record<LapCounterSize, string> = {
  sm: 'gap-1 text-sm',
  md: 'gap-1.5 text-lg',
  lg: 'gap-2 text-2xl',
};

/** The word left of the numbers. It swaps to `FINAL LAP` on the last lap, so the swap is motion. */
export function LapCounterLabel({
  label,
  size = 'md',
  className,
  ...props
}: { label: string; size?: LapCounterSize } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="lap-counter-label"
      className={cn(
        'relative inline-grid overflow-hidden font-display font-bold uppercase leading-none tracking-widest',
        LABEL_SIZES[size],
        className,
      )}
      {...props}
    >
      {/* Both words share one grid cell, so the swap never moves the numbers beside it. */}
      <AnimatePresence initial={false}>
        <motion.span
          key={label}
          className="block whitespace-nowrap [grid-area:1/1]"
          initial={{ opacity: 0, transform: 'translateY(4px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{
            opacity: 0,
            transform: 'translateY(-4px)',
            transition: { duration: DURATION.fast, ease: EASE_OUT },
          }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function LapCounterValue({
  lap,
  totalLaps,
  size = 'md',
  className,
  ...props
}: { lap: number; totalLaps: number; size?: LapCounterSize } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="lap-counter-value"
      className={cn(
        'inline-flex items-baseline font-mono font-bold leading-none tabular-nums',
        VALUE_SIZES[size],
        className,
      )}
      {...props}
    >
      {/* Two characters are reserved so lap 9 → 10 does not widen the counter. */}
      <RollingNumber className="min-w-[2ch] justify-items-end" value={lap} direction="up" />
      <span className="opacity-50">/</span>
      <span>{totalLaps}</span>
    </span>
  );
}

/**
 * The broadcast lap counter: `LAP 12 / 57`, with the lap rolling up as the race runs.
 * The parent owns the lap; the counter only shows it.
 */
export function LapCounter({
  lap,
  totalLaps,
  label = 'LAP',
  size = 'md',
  className,
  ...props
}: {
  lap: number;
  totalLaps: number;
  label?: string;
  size?: LapCounterSize;
} & React.ComponentProps<'div'>) {
  const isFinal = totalLaps > 0 && lap >= totalLaps;
  return (
    <div
      data-slot="lap-counter"
      data-final={isFinal ? 'true' : 'false'}
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center border border-border bg-card text-card-foreground',
        ROOT_SIZES[size],
        className,
      )}
      {...props}
    >
      <span className="sr-only">{isFinal ? 'Final lap' : `Lap ${lap} of ${totalLaps}`}</span>
      <LapCounterLabel aria-hidden label={isFinal ? 'FINAL LAP' : label} size={size} />
      <LapCounterValue aria-hidden lap={lap} totalLaps={totalLaps} size={size} />
    </div>
  );
}
