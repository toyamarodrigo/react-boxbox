import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import { cn } from '@/lib/utils';

export type RollingNumberDirection = 'up' | 'down';

/** Where the new value comes from: `up` enters from below and pushes the old one out at the top. */
const ENTER: Record<RollingNumberDirection, string> = {
  up: 'translateY(100%)',
  down: 'translateY(-100%)',
};
const EXIT: Record<RollingNumberDirection, string> = {
  up: 'translateY(-100%)',
  down: 'translateY(100%)',
};

/**
 * A number that rolls to its next value like a mechanical counter.
 * Pass `direction="up"` when the change is an improvement (a lower position),
 * `"down"` when it is a loss, so the motion carries the meaning.
 */
export function RollingNumber({
  value,
  direction = 'up',
  className,
  ...props
}: {
  value: number | string;
  direction?: RollingNumberDirection;
} & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="rolling-number"
      className={cn('relative inline-grid overflow-hidden leading-none tabular-nums', className)}
      {...props}
    >
      {/* Old and new digits share one grid cell, so the roll never changes the box or needs measuring. */}
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          className="block [grid-area:1/1]"
          initial={{ opacity: 0, transform: ENTER[direction] }}
          animate={{ opacity: 1, transform: 'translateY(0%)' }}
          exit={{ opacity: 0, transform: EXIT[direction] }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
