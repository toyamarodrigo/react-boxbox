import * as React from 'react';
import { AnimatePresence, animate, motion } from 'motion/react';

import { cn } from '@/lib/utils';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { SectorStatus, SectorTime } from '@/registry/boxbox/lib/types';

const BAR_COLOR: Record<SectorStatus, string> = {
  fastest: 'bg-sector-fastest',
  personal: 'bg-sector-personal',
  slower: 'bg-sector-slower',
  unset: 'bg-sector-unset',
};

const TEXT_COLOR: Record<SectorStatus, string> = {
  fastest: 'text-sector-fastest',
  personal: 'text-sector-personal',
  slower: 'text-sector-slower',
  unset: 'text-muted-foreground',
};

/** Status is carried by colour alone on screen, so it is also spoken. */
const STATUS_LABEL: Record<SectorStatus, string> = {
  fastest: 'session fastest',
  personal: 'personal best',
  slower: 'slower',
  unset: 'not set',
};

const EMPTY = '—';

/** Seconds between the start of one sector bar fill and the next. */
const STAGGER_STEP = 0.06;

/**
 * One-shot flash behind a session-fastest lap. A literal rgba is used instead of
 * `var(--sector-fastest)` because Motion interpolates rgb/hsl, not oklch; the value
 * is the theme's fastest purple at 45% alpha.
 */
const FLASH_FASTEST = 'rgba(150, 74, 227, 0.45)';
const FLASH_IDLE = 'rgba(0, 0, 0, 0)';

/** Formats a sector time in seconds as `30.512`, or an em dash when unset. */
export function formatSectorTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return EMPTY;
  return (Math.round(seconds * 1000) / 1000).toFixed(3);
}

/** Formats a lap time in seconds as `1:05.007` (or `59.999` under a minute). */
export function formatLapTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return EMPTY;
  const millis = Math.round(seconds * 1000);
  const minutes = Math.floor(millis / 60000);
  const rest = (millis - minutes * 60000) / 1000;
  if (minutes === 0) return rest.toFixed(3);
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

export type SectorTimesSectorProps = React.ComponentProps<'div'> & {
  sector: SectorTime;
  index: number;
  miniSectors?: number;
  layout?: 'row' | 'stack';
};

export function SectorTimesSector({
  sector,
  index,
  miniSectors = 1,
  layout = 'row',
  className,
  ...props
}: SectorTimesSectorProps) {
  const { time, status } = sector;
  const complete = time != null;
  const segments = Math.max(1, Math.round(miniSectors));

  // Sector `index` starts `STAGGER_STEP` after sector 0, so three sectors landing in one
  // render read as one event instead of appearing all at once.
  const sectorDelay = index * STAGGER_STEP;

  const bar = (
    <div aria-hidden className="flex min-w-0 flex-1 gap-px">
      {Array.from({ length: segments }, (_, segment) => (
        <div key={segment} className="h-[3px] flex-1 overflow-hidden bg-muted">
          <AnimatePresence initial={false}>
            {complete ? (
              <motion.div
                key={`${index}-${time}`}
                className={cn('h-full w-full origin-left', BAR_COLOR[status])}
                initial={{ transform: 'scaleX(0)', opacity: 1 }}
                animate={{ transform: 'scaleX(1)', opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: DURATION.tick, ease: EASE_OUT },
                }}
                transition={{
                  duration: DURATION.base,
                  ease: EASE_OUT,
                  delay: sectorDelay + (segment * 0.2) / segments,
                }}
              />
            ) : null}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );

  const label = (
    <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      S{index + 1}
    </span>
  );

  const value = (
    <motion.span
      key={`${index}-${time}`}
      className={cn('font-mono text-sm tabular-nums', TEXT_COLOR[status])}
      initial={{ opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ duration: DURATION.fast, ease: EASE_OUT, delay: sectorDelay }}
    >
      {formatSectorTime(time)}
      <span className="sr-only">{`, ${STATUS_LABEL[status]}`}</span>
    </motion.span>
  );

  return (
    <div
      data-slot="sector-times-sector"
      data-index={index}
      data-status={status}
      className={cn(
        'min-w-0',
        layout === 'stack' ? 'flex items-center gap-3' : 'flex flex-1 flex-col gap-1.5',
        className,
      )}
      {...props}
    >
      {layout === 'stack' ? (
        <>
          {label}
          {bar}
          {value}
        </>
      ) : (
        <>
          {bar}
          <div className="flex items-baseline justify-between gap-2">
            {label}
            {value}
          </div>
        </>
      )}
    </div>
  );
}

export type SectorTimesLapProps = React.ComponentProps<'div'> & {
  lapTime?: number | null;
  status?: SectorStatus;
  countUp?: boolean;
};

export function SectorTimesLap({
  lapTime = null,
  status = 'unset',
  countUp = false,
  className,
  ...props
}: SectorTimesLapProps) {
  // `animated` only holds in-flight count-up values; otherwise the prop is shown directly.
  const [animated, setAnimated] = React.useState<number | null>(null);
  const previous = React.useRef<number | null>(lapTime);
  const shown = countUp && animated != null ? animated : lapTime;
  const flashing = status === 'fastest' && lapTime != null;

  React.useEffect(() => {
    const from = previous.current;
    previous.current = lapTime;
    if (!countUp || from == null || lapTime == null || from === lapTime) return;
    const controls = animate(from, lapTime, {
      duration: 0.6,
      ease: EASE_OUT,
      onUpdate: setAnimated,
      onComplete: () => setAnimated(null),
    });
    return () => {
      controls.stop();
      setAnimated(null);
    };
  }, [countUp, lapTime]);

  return (
    <div
      data-slot="sector-times-lap"
      data-status={status}
      className={cn('flex items-baseline justify-between gap-3', className)}
      {...props}
    >
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Lap
      </span>
      <motion.span
        // Remounting with the flash colour is what plays it: a keyed mount runs `initial`,
        // so the flash fires when the lap lands as session fastest, not on every render.
        key={flashing ? `fastest-${lapTime}` : 'lap'}
        data-flash={flashing ? 'fastest' : undefined}
        initial={flashing ? { backgroundColor: FLASH_FASTEST } : false}
        animate={{ backgroundColor: FLASH_IDLE }}
        transition={{ duration: DURATION.slow, ease: EASE_OUT }}
        className={cn('-mx-1 px-1 font-mono text-xl font-bold tabular-nums', TEXT_COLOR[status])}
      >
        {formatLapTime(shown)}
        <span className="sr-only">{`, ${STATUS_LABEL[status]}`}</span>
      </motion.span>
    </div>
  );
}

export type SectorTimesProps = React.ComponentProps<'div'> & {
  sectors: [SectorTime, SectorTime, SectorTime];
  lapTime?: number | null;
  lapStatus?: SectorStatus;
  miniSectors?: number;
  layout?: 'row' | 'stack';
  countUp?: boolean;
};

export function SectorTimes({
  sectors,
  lapTime = null,
  lapStatus = 'unset',
  miniSectors = 1,
  layout = 'row',
  countUp = false,
  className,
  ...props
}: SectorTimesProps) {
  const lap = <SectorTimesLap lapTime={lapTime} status={lapStatus} countUp={countUp} />;

  return (
    <div
      // oxlint-disable-next-line prefer-tag-over-role -- a timing panel is a labelled group, not a form fieldset
      role="group"
      aria-label="Sector times"
      data-slot="sector-times"
      data-layout={layout}
      className={cn(
        'flex w-full min-w-0 flex-col gap-3 border border-border bg-card p-3 text-card-foreground',
        className,
      )}
      {...props}
    >
      {layout === 'stack' ? lap : null}
      <div className={cn('flex min-w-0 gap-3', layout === 'stack' ? 'flex-col' : 'items-end')}>
        {sectors.map((sector, index) => (
          <SectorTimesSector
            key={index}
            sector={sector}
            index={index}
            miniSectors={miniSectors}
            layout={layout}
          />
        ))}
      </div>
      {layout === 'row' ? lap : null}
    </div>
  );
}
