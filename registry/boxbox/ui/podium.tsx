/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the steps are laid out 2-1-3, not in rank order, so a list element would read out of order */
import { Fragment } from 'react';
import { AnimatePresence, type HTMLMotionProps, motion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { Driver, Team } from '@/registry/boxbox/lib/types';
import { cn } from '@/lib/utils';

export type PodiumPosition = 1 | 2 | 3;
export type PodiumSize = 'sm' | 'md' | 'lg';
export type PodiumEntry = { driver: Driver; team: Team; detail?: string };
export type PodiumSteps = readonly [PodiumEntry, PodiumEntry, PodiumEntry];

export type PodiumStepProps = {
  entry: PodiumEntry;
  position: PodiumPosition;
  size?: PodiumSize;
  /** Seconds to wait before the step rises, so the ceremony runs 3 → 2 → 1. */
  delay?: number;
};

/** Left to right on screen: second, first, third. */
const VISUAL_ORDER = [2, 1, 3] as const satisfies readonly PodiumPosition[];
/** Seconds between two steps rising. */
const STAGGER = 0.12;

const ORDINALS: Record<PodiumPosition, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

const BLOCK_HEIGHTS: Record<PodiumSize, Record<PodiumPosition, string>> = {
  sm: { 1: 'h-14', 2: 'h-10', 3: 'h-8' },
  md: { 1: 'h-24', 2: 'h-16', 3: 'h-12' },
  lg: { 1: 'h-32', 2: 'h-24', 3: 'h-16' },
};

const STEP_WIDTHS: Record<PodiumSize, string> = {
  sm: 'w-20',
  md: 'w-28',
  lg: 'w-36',
};

const NUMBER_SIZES: Record<PodiumSize, string> = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
};

const CODE_SIZES: Record<PodiumSize, string> = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
};

/** The order a step leaves in, and the order it arrives in: last place first. */
export function podiumStepDelay(position: PodiumPosition) {
  return (3 - position) * STAGGER;
}

/** The entry of one position out of the P1, P2, P3 tuple. */
export function podiumEntryAt(steps: PodiumSteps, position: PodiumPosition): PodiumEntry {
  if (position === 1) return steps[0];
  if (position === 2) return steps[1];
  return steps[2];
}

export function PodiumStep({
  entry,
  position,
  size = 'md',
  delay = 0,
  className,
  ...props
}: PodiumStepProps & HTMLMotionProps<'div'>) {
  const { driver, team, detail } = entry;
  const name = `${driver.firstName} ${driver.lastName}`;
  return (
    <motion.div
      role="listitem"
      data-slot="podium-step"
      data-position={position}
      initial={{ opacity: 0, transform: 'translateY(24px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      exit={{
        opacity: 0,
        transform: 'translateY(24px)',
        transition: { duration: DURATION.fast, ease: EASE_OUT },
      }}
      transition={{ duration: DURATION.base, ease: EASE_OUT, delay }}
      className={cn('flex shrink-0 flex-col justify-end gap-2', STEP_WIDTHS[size], className)}
      {...props}
    >
      <span className="sr-only">{`${ORDINALS[position]}, ${name}, ${team.name}`}</span>
      <div aria-hidden className="flex flex-col items-center gap-0.5 text-center">
        <span
          data-slot="podium-step-code"
          className={cn(
            'font-display font-black uppercase leading-none tracking-wider',
            CODE_SIZES[size],
          )}
        >
          {driver.code}
        </span>
        <span
          data-slot="podium-step-name"
          className="font-display text-[0.625rem] font-semibold uppercase leading-tight tracking-[0.2em] text-muted-foreground"
        >
          {name}
        </span>
        {detail !== undefined && (
          <span
            data-slot="podium-step-detail"
            className="font-mono text-[0.625rem] font-bold leading-none tabular-nums text-muted-foreground"
          >
            {detail}
          </span>
        )}
      </div>
      <div
        aria-hidden
        data-slot="podium-step-block"
        className={cn(
          'grid place-items-center border-t-4 border-border bg-card text-card-foreground',
          BLOCK_HEIGHTS[size][position],
        )}
        style={{ borderColor: team.color }}
      >
        <span className={cn('font-display font-black leading-none', NUMBER_SIZES[size])}>
          {position}
        </span>
      </div>
    </motion.div>
  );
}

export function Podium({
  steps,
  visible = true,
  size = 'md',
  renderStep,
  className,
  ...props
}: {
  /** P1, P2 and P3 in that order. They are placed on screen as 2, 1, 3. */
  steps: PodiumSteps;
  visible?: boolean;
  size?: PodiumSize;
  renderStep?: (props: PodiumStepProps) => React.ReactNode;
} & React.ComponentProps<'div'>) {
  return (
    <AnimatePresence>
      {visible && (
        <div
          key="podium"
          role="list"
          data-slot="podium"
          data-size={size}
          aria-label="Podium"
          className={cn('flex items-end justify-center gap-1', className)}
          {...props}
        >
          {VISUAL_ORDER.map((position) => {
            const stepProps: PodiumStepProps = {
              entry: podiumEntryAt(steps, position),
              position,
              size,
              delay: podiumStepDelay(position),
            };
            return (
              <Fragment key={position}>
                {renderStep ? renderStep(stepProps) : <PodiumStep {...stepProps} />}
              </Fragment>
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}
