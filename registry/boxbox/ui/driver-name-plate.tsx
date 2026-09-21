import { AnimatePresence, motion, type Variants } from 'motion/react';
import { DURATION, EASE_OUT, SPRING_ROW } from '@/registry/boxbox/lib/motion';
import type { Driver, Team } from '@/registry/boxbox/lib/types';
import { RollingNumber } from '@/registry/boxbox/ui/rolling-number';
import { cn } from '@/lib/utils';

export type DriverNamePlateVariant = 'compact' | 'full';
export type DriverNamePlateAlign = 'left' | 'right';
export type DriverNamePlateStatusValue = 'pit' | 'lapped' | 'fastest' | 'out';

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

export const DRIVER_NAME_PLATE_STATUS_LABELS: Record<DriverNamePlateStatusValue, string> = {
  pit: 'PIT',
  lapped: 'LAPPED',
  fastest: 'FASTEST LAP',
  out: 'OUT',
};

const STATUS_COLORS: Record<DriverNamePlateStatusValue, string> = {
  pit: 'bg-status-pit text-status-pit-foreground',
  lapped: 'bg-status-lapped text-status-lapped-foreground',
  fastest: 'bg-sector-fastest text-sector-fastest-foreground',
  out: 'bg-muted text-muted-foreground',
};

const PLATE_TRANSITION = { duration: DURATION.base, ease: EASE_OUT } as const;

const partVariants = {
  hidden: { opacity: 0, transform: 'translateY(8px)' },
  visible: {
    opacity: 1,
    transform: 'translateY(0px)',
    transition: { duration: DURATION.fast, ease: EASE_OUT },
  },
} satisfies Variants;

/** The plate and its status tag both wipe from the edge the plate is aligned to. */
function hiddenClip(align: DriverNamePlateAlign) {
  return align === 'left' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
}

function plateVariants(align: DriverNamePlateAlign): Variants {
  return {
    hidden: {
      clipPath: hiddenClip(align),
      transition: PLATE_TRANSITION,
    },
    visible: {
      clipPath: 'inset(0 0 0 0)',
      transition: { ...PLATE_TRANSITION, staggerChildren: 0.05, delayChildren: 0.1 },
    },
  };
}

export function driverDisplayName(driver: Driver, variant: DriverNamePlateVariant = 'full') {
  return variant === 'compact'
    ? driver.code
    : `${driver.firstName} ${driver.lastName.toUpperCase()}`;
}

export function DriverNamePlatePosition({
  position,
  positionChange = 0,
  className,
  ...props
}: { position: number; positionChange?: number } & MotionSafeProps<'div'>) {
  return (
    <motion.div
      data-slot="driver-name-plate-position"
      variants={partVariants}
      className={cn(
        'grid min-w-11 shrink-0 place-items-center self-stretch bg-primary px-2 py-2 font-display text-xl font-black leading-none tabular-nums text-primary-foreground',
        className,
      )}
      {...props}
    >
      <RollingNumber value={position} direction={positionChange < 0 ? 'down' : 'up'} />
    </motion.div>
  );
}

export function DriverNamePlateName({
  driver,
  variant = 'full',
  className,
  ...props
}: { driver: Driver; variant?: DriverNamePlateVariant } & MotionSafeProps<'div'>) {
  return (
    <motion.div
      data-slot="driver-name-plate-name"
      variants={partVariants}
      className={cn('flex flex-col justify-center px-3 py-2 font-display leading-none', className)}
      {...props}
    >
      {variant === 'compact' ? (
        <span className="text-lg font-black uppercase tracking-widest">
          {driverDisplayName(driver, 'compact')}
        </span>
      ) : (
        <>
          <span className="text-sm font-light tracking-wide">{driver.firstName}</span>
          <span className="text-2xl font-black uppercase leading-none tracking-tight">
            {driver.lastName}
          </span>
        </>
      )}
    </motion.div>
  );
}

export function DriverNamePlateTeam({
  team,
  driver,
  variant = 'full',
  className,
  ...props
}: {
  team?: Team;
  driver: Driver;
  variant?: DriverNamePlateVariant;
} & MotionSafeProps<'div'>) {
  return (
    <motion.div
      data-slot="driver-name-plate-team"
      variants={partVariants}
      className={cn('flex shrink-0 items-stretch gap-2 self-stretch', className)}
      {...props}
    >
      <span
        aria-hidden
        className="w-1.5 shrink-0 bg-border"
        style={team ? { backgroundColor: team.color } : undefined}
      />
      {variant === 'full' && (
        <span className="flex flex-col justify-center gap-1 py-2 pr-3 text-muted-foreground">
          {team && (
            <span className="font-display text-[0.625rem] font-semibold uppercase leading-none tracking-[0.2em]">
              {team.name}
            </span>
          )}
          <span className="font-mono text-[0.625rem] font-bold leading-none tabular-nums">
            {driver.number}
          </span>
        </span>
      )}
    </motion.div>
  );
}

export function DriverNamePlateStatus({
  status,
  align = 'left',
  className,
  ...props
}: {
  status: DriverNamePlateStatusValue;
  align?: DriverNamePlateAlign;
} & MotionSafeProps<'div'>) {
  return (
    <motion.div
      data-slot="driver-name-plate-status"
      initial={{ clipPath: hiddenClip(align) }}
      animate={{ clipPath: 'inset(0 0 0 0)' }}
      exit={{
        clipPath: hiddenClip(align),
        transition: { duration: DURATION.tick, ease: EASE_OUT },
      }}
      transition={{ duration: DURATION.fast, ease: EASE_OUT }}
      className={cn(
        'flex shrink-0 items-center self-stretch px-2 font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em]',
        STATUS_COLORS[status],
        className,
      )}
      {...props}
    >
      {DRIVER_NAME_PLATE_STATUS_LABELS[status]}
    </motion.div>
  );
}

export function DriverNamePlate({
  driver,
  team,
  position,
  positionChange = 0,
  variant = 'full',
  status,
  visible = true,
  align = 'left',
  className,
  ...props
}: {
  driver: Driver;
  team?: Team;
  position?: number;
  /** Places gained (positive) or lost (negative); decides which way the position digit rolls. */
  positionChange?: number;
  variant?: DriverNamePlateVariant;
  status?: DriverNamePlateStatusValue;
  visible?: boolean;
  align?: DriverNamePlateAlign;
} & MotionSafeProps<'div'>) {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          data-slot="driver-name-plate"
          data-variant={variant}
          data-align={align}
          data-status={status}
          layout
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={plateVariants(align)}
          transition={{ layout: SPRING_ROW }}
          className={cn(
            'relative inline-flex items-stretch overflow-hidden rounded-none bg-card text-card-foreground',
            align === 'right' && 'flex-row-reverse text-right',
            className,
          )}
          {...props}
        >
          {position !== undefined && (
            <DriverNamePlatePosition position={position} positionChange={positionChange} />
          )}
          <DriverNamePlateTeam team={team} driver={driver} variant={variant} />
          <DriverNamePlateName driver={driver} variant={variant} />
          <AnimatePresence mode="popLayout" initial={false}>
            {status && <DriverNamePlateStatus key={status} status={status} align={align} />}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
