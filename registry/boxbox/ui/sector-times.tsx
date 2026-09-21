import * as React from 'react';
import { animate, motion } from 'motion/react';

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

  const bar = (
    <div aria-hidden className="flex min-w-0 flex-1 gap-px">
      {Array.from({ length: segments }, (_, segment) => (
        <div key={segment} className="h-[3px] flex-1 overflow-hidden bg-muted">
          <motion.div
            key={`${index}-${time}`}
            className={cn(
              'h-full w-full origin-left',
              complete ? BAR_COLOR[status] : 'bg-transparent',
            )}
            initial={{ scaleX: 0 }}
            animate={complete ? { scaleX: 1, opacity: [1, 0.6, 1] } : { scaleX: 0 }}
            transition={{
              duration: DURATION.base,
              ease: EASE_OUT,
              delay: (segment * 0.2) / segments,
            }}
          />
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
    <span className={cn('font-mono text-sm tabular-nums', TEXT_COLOR[status])}>
      {formatSectorTime(time)}
      <span className="sr-only">{`, ${STATUS_LABEL[status]}`}</span>
    </span>
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
      <span className={cn('font-mono text-xl font-bold tabular-nums', TEXT_COLOR[status])}>
        {formatLapTime(shown)}
        <span className="sr-only">{`, ${STATUS_LABEL[status]}`}</span>
      </span>
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
