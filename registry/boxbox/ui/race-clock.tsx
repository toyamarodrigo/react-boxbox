import { cn } from '@/lib/utils';

export type RaceClockSize = 'sm' | 'md' | 'lg';
export type RaceClockDirection = 'down' | 'up';

const ROOT_SIZES: Record<RaceClockSize, string> = {
  sm: 'gap-2 px-2 py-1',
  md: 'gap-3 px-3 py-1.5',
  lg: 'gap-4 px-4 py-2',
};

const LABEL_SIZES: Record<RaceClockSize, string> = {
  sm: 'text-[0.625rem]',
  md: 'text-xs',
  lg: 'text-sm',
};

const TIME_SIZES: Record<RaceClockSize, string> = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
};

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Formats milliseconds as `H:MM:SS`, or `MM:SS` when hours are hidden.
 * Negative input reads as zero, so a clock that runs out stops at `0:00:00`.
 */
export function formatRaceClock(ms: number, { showHours = true }: { showHours?: boolean } = {}) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  if (!showHours) return `${pad(minutes)}:${pad(seconds % 60)}`;
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
}

export function RaceClockLabel({
  label,
  size = 'md',
  className,
  ...props
}: { label: string; size?: RaceClockSize } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="race-clock-label"
      className={cn(
        'whitespace-nowrap font-display font-bold uppercase leading-none tracking-widest',
        LABEL_SIZES[size],
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}

export function RaceClockTime({
  ms,
  showHours = true,
  size = 'md',
  className,
  ...props
}: { ms: number; showHours?: boolean; size?: RaceClockSize } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="race-clock-time"
      className={cn('font-mono font-bold leading-none tabular-nums', TIME_SIZES[size], className)}
      {...props}
    >
      {formatRaceClock(ms, { showHours })}
    </span>
  );
}

/**
 * The broadcast race clock. It never runs a timer of its own: the parent owns `ms`,
 * so one source of truth drives the clock, the lap counter, and the timing tower.
 * `direction` is wording only — it says whether the figure is time remaining or elapsed.
 */
export function RaceClock({
  ms,
  direction = 'down',
  label,
  showHours = true,
  size = 'md',
  className,
  ...props
}: {
  ms: number;
  direction?: RaceClockDirection;
  label?: string;
  showHours?: boolean;
  size?: RaceClockSize;
} & React.ComponentProps<'div'>) {
  const time = formatRaceClock(ms, { showHours });
  return (
    <div
      data-slot="race-clock"
      data-direction={direction}
      role="timer"
      className={cn(
        'inline-flex items-center border border-border bg-card text-card-foreground',
        ROOT_SIZES[size],
        className,
      )}
      {...props}
    >
      <span className="sr-only">{`${time} ${direction === 'down' ? 'remaining' : 'elapsed'}`}</span>
      {label && <RaceClockLabel aria-hidden label={label} size={size} />}
      <RaceClockTime aria-hidden ms={ms} showHours={showHours} size={size} />
    </div>
  );
}
