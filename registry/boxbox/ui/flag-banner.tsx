/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the bar is a live region, not a form output */
import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { TrackStatus } from '@/registry/boxbox/lib/types';
import { cn } from '@/lib/utils';

export type FlagBannerAlign = 'left' | 'center';
export type FlagBannerSize = 'sm' | 'md' | 'lg';

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

export const FLAG_BANNER_LABELS: Record<TrackStatus, string> = {
  green: 'TRACK CLEAR',
  yellow: 'YELLOW FLAG',
  'double-yellow': 'DOUBLE YELLOW',
  red: 'RED FLAG',
  sc: 'SAFETY CAR',
  vsc: 'VIRTUAL SAFETY CAR',
  chequered: 'CHEQUERED FLAG',
};

const STATUS_COLORS: Record<TrackStatus, string> = {
  green: 'bg-flag-green text-flag-green-foreground',
  yellow: 'bg-flag-yellow text-flag-yellow-foreground',
  'double-yellow': 'bg-flag-yellow text-flag-yellow-foreground',
  red: 'bg-flag-red text-flag-red-foreground',
  sc: 'bg-flag-yellow text-flag-yellow-foreground',
  vsc: 'bg-flag-yellow text-flag-yellow-foreground',
  chequered: 'bg-flag-chequered-a text-flag-chequered-b',
};

/** Statuses a viewer has to act on right away; everything else is announced politely. */
const ASSERTIVE_STATUSES: readonly TrackStatus[] = ['double-yellow', 'red', 'sc', 'vsc'];

/** A pattern only where the flag itself is a pattern; both colours are theme tokens. */
const STATUS_PATTERNS: Partial<Record<TrackStatus, React.CSSProperties>> = {
  'double-yellow': {
    backgroundImage:
      'repeating-linear-gradient(45deg, transparent 0 14px, var(--flag-yellow-foreground) 14px 18px)',
  },
  chequered: {
    backgroundImage:
      'repeating-conic-gradient(var(--flag-chequered-b) 0% 25%, var(--flag-chequered-a) 0% 50%)',
    backgroundSize: '24px 24px',
  },
};

/** The chequers run under the text, so the text carries its own backing there. */
const CONTENT_COLORS: Partial<Record<TrackStatus, string>> = {
  chequered: 'bg-flag-chequered-b px-2 py-1 text-flag-chequered-b-foreground',
};

const SIZES: Record<
  FlagBannerSize,
  { bar: string; content: string; label: string; message: string }
> = {
  sm: {
    bar: 'px-3 py-2 text-[0.6875rem]',
    content: 'gap-2',
    label: 'tracking-[0.2em]',
    message: 'text-[0.625rem] tracking-[0.15em]',
  },
  md: {
    bar: 'px-4 py-3 text-sm',
    content: 'gap-3',
    label: 'tracking-[0.25em]',
    message: 'text-xs tracking-[0.15em]',
  },
  lg: {
    bar: 'px-6 py-4 text-xl',
    content: 'gap-4',
    label: 'tracking-[0.3em]',
    message: 'text-sm tracking-[0.15em]',
  },
};

/** The banner wipes from the edge it is aligned to, and out the same way. */
function hiddenClip(align: FlagBannerAlign) {
  return align === 'center' ? 'inset(0 50% 0 50%)' : 'inset(0 100% 0 0)';
}

/** `SECTOR n` is appended only when a sector is named, so the label stays one string. */
export function flagBannerLabel(status: TrackStatus, sector?: number) {
  const label = FLAG_BANNER_LABELS[status];
  return sector === undefined ? label : `${label} · SECTOR ${sector}`;
}

export function FlagBannerLabel({
  status,
  sector,
  className,
  ...props
}: { status: TrackStatus; sector?: number } & React.ComponentProps<'span'>) {
  const label = flagBannerLabel(status, sector);
  return (
    <span
      data-slot="flag-banner-label"
      aria-hidden
      className={cn('inline-flex items-center', className)}
      {...props}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={{ opacity: 0, transform: 'translateY(4px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{ opacity: 0, transform: 'translateY(-4px)' }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function FlagBannerMessage({
  message,
  className,
  ...props
}: { message: string } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="flag-banner-message"
      aria-hidden
      className={cn('font-semibold', className)}
      {...props}
    >
      {message}
    </span>
  );
}

export function FlagBanner({
  status,
  sector,
  message,
  visible = true,
  align = 'left',
  size = 'md',
  className,
  ...props
}: {
  status: TrackStatus;
  /** One-based sector number; appended to the label as `SECTOR n`. */
  sector?: number;
  message?: string;
  visible?: boolean;
  align?: FlagBannerAlign;
  size?: FlagBannerSize;
} & MotionSafeProps<'div'>) {
  const sizes = SIZES[size];
  const spoken = `Track status: ${flagBannerLabel(status, sector)}.${message ? ` ${message}.` : ''}`;
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          data-slot="flag-banner"
          data-status={status}
          data-align={align}
          data-size={size}
          role="status"
          aria-live={ASSERTIVE_STATUSES.includes(status) ? 'assertive' : 'polite'}
          initial={{ clipPath: hiddenClip(align) }}
          animate={{
            clipPath: 'inset(0 0 0 0)',
            transition: { duration: DURATION.base, ease: EASE_OUT },
          }}
          exit={{
            clipPath: hiddenClip(align),
            transition: { duration: DURATION.fast, ease: EASE_OUT },
          }}
          style={STATUS_PATTERNS[status]}
          className={cn(
            'flex w-full items-center overflow-hidden rounded-none font-display font-black uppercase leading-none transition-colors',
            align === 'center' && 'justify-center text-center',
            STATUS_COLORS[status],
            sizes.bar,
            className,
          )}
          {...props}
        >
          <span className="sr-only">{spoken}</span>
          <span
            className={cn(
              'flex items-center',
              align === 'center' ? 'justify-center' : 'justify-start',
              sizes.content,
              CONTENT_COLORS[status],
            )}
          >
            <FlagBannerLabel status={status} sector={sector} className={sizes.label} />
            {message && <FlagBannerMessage message={message} className={sizes.message} />}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
