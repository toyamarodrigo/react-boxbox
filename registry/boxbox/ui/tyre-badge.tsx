/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the badge is a graphic built from styled elements, not an <img> */
import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { TyreCompound } from '@/registry/boxbox/lib/types';
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
  className,
  ...props
}: { compound: TyreCompound; size?: TyreBadgeSize } & React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="tyre-badge-ring"
      className={cn('relative shrink-0', RING_SIZES[size], className)}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={compound}
          initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.8 }}
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
      {isNew ? 'NEW' : age}
    </span>
  );
}

function ariaLabel(compound: TyreCompound, age: number | undefined, isNew: boolean | undefined) {
  const tyre = `${TYRE_COMPOUND_LABELS[compound]} tyre`;
  if (isNew) return `${tyre}, new`;
  if (age === undefined) return tyre;
  return `${tyre}, ${age} ${age === 1 ? 'lap' : 'laps'}`;
}

export function TyreBadge({
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
} & React.ComponentProps<'div'>) {
  const showAge = isNew || age !== undefined;
  return (
    <div
      data-slot="tyre-badge"
      data-compound={compound}
      role="img"
      aria-label={ariaLabel(compound, age, isNew)}
      className={cn('inline-flex items-center gap-2', className)}
      {...props}
    >
      <TyreBadgeRing aria-hidden compound={compound} size={size} />
      {showAge && (
        <TyreBadgeAge aria-hidden compound={compound} age={age} isNew={isNew} size={size} />
      )}
    </div>
  );
}
