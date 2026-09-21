/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the badge is a graphic built from styled elements, not an <img> */
import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { TyreCompound } from '@/registry/boxbox/lib/types';
import { RollingNumber } from '@/registry/boxbox/ui/rolling-number';
import { cn } from '@/lib/utils';

export type TyreCompoundName = 'soft' | 'medium' | 'hard' | 'inter' | 'wet';
export type TyreBadgeSize = 'sm' | 'md' | 'lg';

export const TYRE_COMPOUND_NAMES: Record<TyreCompound, TyreCompoundName> = {
  S: 'soft',
  M: 'medium',
  H: 'hard',
  I: 'inter',
  W: 'wet',
};

export const TYRE_COMPOUND_LABELS: Record<TyreCompound, string> = {
  S: 'Soft',
  M: 'Medium',
  H: 'Hard',
  I: 'Intermediate',
  W: 'Wet',
};

export function tyreCompoundName(compound: TyreCompound): TyreCompoundName {
  return TYRE_COMPOUND_NAMES[compound];
}

const RING_COLORS: Record<TyreCompound, string> = {
  S: 'bg-tyre-soft text-tyre-soft-foreground',
  M: 'bg-tyre-medium text-tyre-medium-foreground',
  H: 'bg-tyre-hard text-tyre-hard-foreground',
  I: 'bg-tyre-inter text-tyre-inter-foreground',
  W: 'bg-tyre-wet text-tyre-wet-foreground',
};

const ACCENT_COLORS: Record<TyreCompound, string> = {
  S: 'border-tyre-soft',
  M: 'border-tyre-medium',
  H: 'border-tyre-hard',
  I: 'border-tyre-inter',
  W: 'border-tyre-wet',
};

const WEAR_COLORS: Record<TyreCompound, string> = {
  S: 'text-tyre-soft',
  M: 'text-tyre-medium',
  H: 'text-tyre-hard',
  I: 'text-tyre-inter',
  W: 'text-tyre-wet',
};

/** Percentage of tyre life used at which the arc turns to the destructive colour. */
export const TYRE_WEAR_WARNING = 70;

// The arc lives in a 100×100 viewBox, so one geometry serves every badge size and
// only the stroke gets thicker as the badge gets smaller.
const WEAR_RADIUS = 46;
const WEAR_LENGTH = 2 * Math.PI * WEAR_RADIUS;
const WEAR_STROKES: Record<TyreBadgeSize, number> = { sm: 8, md: 7, lg: 6 };

const clampWear = (wear: number) => Math.min(100, Math.max(0, wear));

const RING_SIZES: Record<TyreBadgeSize, string> = {
  sm: 'size-7 text-[0.6875rem]',
  md: 'size-10 text-sm',
  lg: 'size-14 text-xl',
};

const AGE_SIZES: Record<TyreBadgeSize, string> = {
  sm: 'pl-1.5 text-[0.625rem]',
  md: 'pl-2 text-xs',
  lg: 'pl-2.5 text-base',
};

export function TyreBadgeRing({
  compound,
  size = 'md',
  wear,
  wearWarning = TYRE_WEAR_WARNING,
  className,
  ...props
}: {
  compound: TyreCompound;
  size?: TyreBadgeSize;
  wear?: number;
  wearWarning?: number;
} & React.ComponentProps<'div'>) {
  const worn = wear === undefined ? undefined : clampWear(wear);
  return (
    <div
      data-slot="tyre-badge-ring"
      className={cn('relative shrink-0', RING_SIZES[size], className)}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={compound}
          initial={{ opacity: 0, transform: 'rotate(-90deg) scale(0.8)' }}
          animate={{ opacity: 1, transform: 'rotate(0deg) scale(1)' }}
          exit={{ opacity: 0, transform: 'rotate(90deg) scale(0.8)' }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
          className={cn(
            'absolute inset-0 grid place-items-center rounded-full font-display font-bold leading-none',
            RING_COLORS[compound],
          )}
        >
          <span
            aria-hidden
            className="absolute inset-[18%] rounded-full border-2 border-current opacity-30"
          />
          <span className="relative">{compound}</span>
        </motion.span>
      </AnimatePresence>
      {worn !== undefined && (
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          // Rotated so the arc starts at 12 o'clock and fills clockwise.
          className={cn('-rotate-90 absolute inset-0 size-full', WEAR_COLORS[compound])}
        >
          <motion.circle
            cx="50"
            cy="50"
            r={WEAR_RADIUS}
            fill="none"
            strokeLinecap="round"
            strokeWidth={WEAR_STROKES[size]}
            strokeDasharray={WEAR_LENGTH}
            initial={{ strokeDashoffset: WEAR_LENGTH }}
            animate={{ strokeDashoffset: WEAR_LENGTH * (1 - worn / 100) }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            // The threshold changes colour, not length, so it transitions on its own.
            className="transition-colors"
            style={{ stroke: worn >= wearWarning ? 'var(--destructive)' : 'currentColor' }}
          />
        </svg>
      )}
    </div>
  );
}

export function TyreBadgeAge({
  compound,
  age,
  isNew,
  size = 'md',
  className,
  ...props
}: {
  compound: TyreCompound;
  age?: number;
  isNew?: boolean;
  size?: TyreBadgeSize;
} & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="tyre-badge-age"
      className={cn(
        'border-l-2 font-mono font-bold uppercase leading-none tabular-nums tracking-wider text-foreground',
        ACCENT_COLORS[compound],
        AGE_SIZES[size],
        className,
      )}
      {...props}
    >
      {/* Two characters are reserved so a lap count crossing 9 → 10 does not widen the badge. */}
      <RollingNumber className="min-w-[2ch]" value={isNew ? 'NEW' : (age ?? '')} direction="up" />
    </span>
  );
}

function ariaLabel(
  compound: TyreCompound,
  age: number | undefined,
  isNew: boolean | undefined,
  wear: number | undefined,
) {
  const tyre = `${TYRE_COMPOUND_LABELS[compound]} tyre`;
  // Wear is carried by the arc's length and colour, so it is also spoken.
  const worn = wear === undefined ? '' : `, ${Math.round(wear)}% worn`;
  if (isNew) return `${tyre}, new${worn}`;
  if (age === undefined) return `${tyre}${worn}`;
  return `${tyre}, ${age} ${age === 1 ? 'lap' : 'laps'}${worn}`;
}

export function TyreBadge({
  compound,
  age,
  isNew,
  size = 'md',
  wear,
  wearWarning = TYRE_WEAR_WARNING,
  className,
  ...props
}: {
  compound: TyreCompound;
  age?: number;
  isNew?: boolean;
  size?: TyreBadgeSize;
  wear?: number;
  wearWarning?: number;
} & React.ComponentProps<'div'>) {
  const showAge = isNew || age !== undefined;
  const worn = wear === undefined ? undefined : clampWear(wear);
  return (
    <div
      data-slot="tyre-badge"
      data-compound={compound}
      data-wear={worn}
      data-wear-warning={worn === undefined ? undefined : String(worn >= wearWarning)}
      role="img"
      aria-label={ariaLabel(compound, age, isNew, worn)}
      className={cn('inline-flex items-center gap-2', className)}
      {...props}
    >
      <TyreBadgeRing
        aria-hidden
        compound={compound}
        size={size}
        wear={wear}
        wearWarning={wearWarning}
      />
      {showAge && (
        <TyreBadgeAge aria-hidden compound={compound} age={age} isNew={isNew} size={size} />
      )}
    </div>
  );
}
