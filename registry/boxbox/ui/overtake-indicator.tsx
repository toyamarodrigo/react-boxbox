/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the badge is a graphic built from styled elements, not an <img> */
import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import { cn } from '@/lib/utils';

/** `drs` is the 2011–2025 wing flap, `overtake` the extra power the rules call Overtake Mode from 2026. */
export type OvertakeMode = 'drs' | 'overtake';
export type OvertakeState = 'off' | 'available' | 'active';
export type OvertakeIndicatorSize = 'sm' | 'md' | 'lg';

export const OVERTAKE_LABELS: Record<OvertakeMode, string> = {
  drs: 'DRS',
  overtake: 'OVT',
};

/** The spoken name of the system; the painted label is an abbreviation. */
const MODE_NAMES: Record<OvertakeMode, string> = {
  drs: 'DRS',
  overtake: 'Overtake',
};

const STATE_COLORS: Record<OvertakeState, string> = {
  off: 'border-muted-foreground/40 text-muted-foreground',
  available: 'border-flag-green bg-transparent text-flag-green',
  active: 'border-flag-green bg-flag-green text-flag-green-foreground',
};

/** `sm` carries the Timing Tower tag footprint so it can stand in for one. */
const SIZES: Record<OvertakeIndicatorSize, string> = {
  sm: 'px-1 text-[0.5rem] leading-[1.4] tracking-widest',
  md: 'px-1.5 text-[0.625rem] leading-[1.5] tracking-widest',
  lg: 'px-2 text-xs leading-[1.6] tracking-[0.2em]',
};

/** `DRS active`, `Overtake available`; the label only replaces the system name when it is given. */
export function overtakeAriaLabel(mode: OvertakeMode, state: OvertakeState, label?: string) {
  return `${label ?? MODE_NAMES[mode]} ${state}`;
}

export function OvertakeIndicator({
  mode = 'drs',
  state = 'off',
  label,
  size = 'md',
  className,
  ...props
}: {
  mode?: OvertakeMode;
  state?: OvertakeState;
  label?: string;
  size?: OvertakeIndicatorSize;
} & React.ComponentProps<'span'>) {
  const text = label ?? OVERTAKE_LABELS[mode];
  const badgeClass = cn(
    'inline-flex items-center justify-center border font-display font-bold uppercase transition-colors',
    SIZES[size],
    STATE_COLORS[state],
  );
  return (
    <span
      data-slot="overtake-indicator"
      data-mode={mode}
      data-state={state}
      role="img"
      aria-label={overtakeAriaLabel(mode, state, label)}
      className={cn('inline-flex shrink-0', className)}
      {...props}
    >
      {state === 'active' ? (
        /**
         * The pulse mounts with the active state and brings its own `AnimatePresence`:
         * an indicator inside a tower row sits under an `AnimatePresence initial={false}`,
         * and that context keeps blocking `initial` on anything mounting later. A fresh
         * presence boundary is what lets the one-shot play, and only on the way into `active`.
         */
        <AnimatePresence>
          <motion.span
            key="active"
            aria-hidden
            initial={{ opacity: 0.4, transform: 'scale(0.95)' }}
            animate={{ opacity: 1, transform: 'scale(1)' }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            className={badgeClass}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      ) : (
        <span aria-hidden className={badgeClass}>
          {text}
        </span>
      )}
    </span>
  );
}
