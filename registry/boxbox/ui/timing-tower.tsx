import { Fragment } from 'react';
import { AnimatePresence, type HTMLMotionProps, LayoutGroup, motion } from 'motion/react';
import { DURATION, EASE_OUT, SPRING_ROW } from '@/registry/boxbox/lib/motion';
import type { Driver, GapMode, TimingRow, Team } from '@/registry/boxbox/lib/types';
import { RollingNumber } from '@/registry/boxbox/ui/rolling-number';
import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';
import { cn } from '@/lib/utils';

const EMPTY = '—';
/**
 * Flash colours are literal rgba so Motion can interpolate them to transparent.
 * They mirror the `--flag-green`, `--primary` and `--sector-fastest` theme tokens.
 */
const FLASH_GAIN = 'rgba(45, 180, 110, 0.45)';
const FLASH_LOSS = 'rgba(220, 60, 60, 0.45)';
const FLASH_FASTEST = 'rgba(150, 70, 225, 0.45)';
const FLASH_IDLE = 'rgba(0, 0, 0, 0)';

/** Orders rows by position, lowest first. Stable for rows that share a position. */
export function sortRows(rows: readonly TimingRow[]): TimingRow[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

/** Formats a gap in seconds: `+1.234`, `+12.3` from 10s, `+1:02.3` from 60s. */
export function formatGap(seconds: number | null): string {
  if (seconds === null) return EMPTY;
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  if (abs >= 60) {
    const minutes = Math.floor(abs / 60);
    return `${sign}${minutes}:${(abs - minutes * 60).toFixed(1).padStart(4, '0')}`;
  }
  return `${sign}${abs.toFixed(abs >= 10 ? 1 : 3)}`;
}

/** Formats a lap time in seconds as `1:31.512`. */
export function formatLapTime(seconds: number | null): string {
  if (seconds === null) return EMPTY;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`;
}

/** The text of the value cell for one row. */
export function rowValue(row: TimingRow, mode: GapMode, isLeader: boolean): string {
  if (row.inPit) return 'IN PIT';
  if (mode === 'lapTime') return formatLapTime(row.lastLapTime);
  if (row.lapped) return '+1 LAP';
  if (isLeader) return 'LEADER';
  return formatGap(mode === 'interval' ? row.interval : row.gapToLeader);
}

export type TimingTowerValueTone = 'default' | 'pit' | 'lapped' | 'fastest';

const VALUE_TONES: Record<TimingTowerValueTone, string> = {
  default: 'text-foreground',
  pit: 'text-status-pit',
  lapped: 'text-status-lapped',
  fastest: 'text-sector-fastest',
};

function valueTone(row: TimingRow, isFastestLap: boolean): TimingTowerValueTone {
  if (row.inPit) return 'pit';
  if (isFastestLap) return 'fastest';
  if (row.lapped) return 'lapped';
  return 'default';
}

/**
 * A one-shot colour flash that fades to transparent as soon as it mounts.
 * It has its own `AnimatePresence` on purpose: rows live inside the tower's
 * `AnimatePresence initial={false}`, and that presence context keeps blocking
 * `initial` on anything that mounts later inside those rows. A fresh presence
 * boundary that allows initial animations is what lets the flash colour play.
 */
function FlashLayer({ color, flashKey }: { color: string; flashKey?: string }) {
  return (
    <AnimatePresence>
      <motion.span
        key={flashKey}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={{ backgroundColor: color }}
        animate={{ backgroundColor: FLASH_IDLE }}
        transition={{ duration: DURATION.slow, ease: EASE_OUT }}
      />
    </AnimatePresence>
  );
}

export type TimingTowerPositionChange = 'gain' | 'loss' | 'none';

/** `gain` when the driver moved up the order, `loss` when down, `none` when the row held station. */
export function positionChangeState(positionChange: number): TimingTowerPositionChange {
  if (positionChange > 0) return 'gain';
  if (positionChange < 0) return 'loss';
  return 'none';
}

export function TimingTowerPosition({
  position,
  positionChange = 0,
  className,
  ...props
}: { position: number; positionChange?: number } & HTMLMotionProps<'div'>) {
  const change = positionChangeState(positionChange);
  const flash = change === 'gain' ? FLASH_GAIN : change === 'loss' ? FLASH_LOSS : null;
  return (
    <motion.div
      data-slot="timing-tower-position"
      data-change={change}
      className={cn(
        'relative grid w-7 shrink-0 place-items-center self-stretch font-display text-sm font-black leading-none tabular-nums',
        className,
      )}
      {...props}
    >
      {/* The key remounts the layer so a second consecutive change flashes again. */}
      {flash && <FlashLayer color={flash} flashKey={`${position}:${positionChange}`} />}
      <RollingNumber
        className="relative"
        value={position}
        direction={change === 'loss' ? 'down' : 'up'}
      />
    </motion.div>
  );
}

export function TimingTowerValue({
  value,
  tone = 'default',
  className,
  ...props
}: { value: string; tone?: TimingTowerValueTone } & React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timing-tower-value"
      data-tone={tone}
      className={cn(
        'relative ml-auto overflow-hidden text-right font-mono text-xs font-bold leading-none tabular-nums',
        VALUE_TONES[tone],
        className,
      )}
      {...props}
    >
      {/* Mounts once when the tone becomes `fastest`, so the flash plays on the flip only. */}
      {tone === 'fastest' && <FlashLayer color={FLASH_FASTEST} />}
      <motion.span
        key={value}
        initial={{ opacity: 0, transform: 'translateY(-3px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: DURATION.tick, ease: EASE_OUT }}
        className="relative block"
      >
        {value}
      </motion.span>
    </div>
  );
}

const TAG_CLASS = 'shrink-0 px-1 font-mono text-[0.5rem] font-bold leading-[1.4] tracking-widest';
const TAG_MOTION = {
  initial: { opacity: 0, transform: 'translateX(-4px)' },
  animate: { opacity: 1, transform: 'translateX(0px)' },
  exit: { opacity: 0, transition: { duration: DURATION.tick, ease: EASE_OUT } },
  transition: { duration: DURATION.fast, ease: EASE_OUT },
} as const;

export function TimingTowerRow({
  row,
  driver,
  team,
  mode = 'leader',
  isLeader = false,
  isFastestLap = false,
  highlighted = false,
  showTyre = true,
  showDrs = true,
  className,
  ...props
}: {
  row: TimingRow;
  driver: Driver;
  team?: Team | undefined;
  mode?: GapMode;
  isLeader?: boolean;
  isFastestLap?: boolean;
  highlighted?: boolean;
  showTyre?: boolean;
  showDrs?: boolean;
} & HTMLMotionProps<'li'>) {
  const gained = row.positionChange > 0;
  const moved = Math.abs(row.positionChange);
  // The value column means something different per mode, and the digits and the
  // ▲/▼ glyph carry no meaning on their own, so each gets a spoken label.
  const valueLabel =
    mode === 'lapTime' ? 'Last lap' : mode === 'interval' ? 'Interval' : 'Gap to leader';
  return (
    <motion.li
      layout="position"
      data-slot="timing-tower-row"
      data-position={row.position}
      data-driver={row.driverId}
      data-pit={String(row.inPit)}
      data-lapped={String(row.lapped)}
      data-drs={String(row.drs)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
      transition={{ layout: SPRING_ROW, opacity: { duration: DURATION.base, ease: EASE_OUT } }}
      className={cn(
        'flex items-center gap-2 border-b border-border bg-card/90 py-1 pr-2 text-card-foreground last:border-b-0',
        highlighted && 'bg-primary/10',
        className,
      )}
      {...props}
    >
      <span className="sr-only">Position</span>
      <TimingTowerPosition position={row.position} positionChange={row.positionChange} />
      <span
        aria-hidden
        className="h-6 w-[3px] shrink-0 bg-muted"
        style={team ? { backgroundColor: team.color } : undefined}
      />
      <span className="font-display text-sm font-bold uppercase leading-none tracking-wider">
        {driver.code}
      </span>
      {/* A fixed slot: the glyph fades in and out without taking or freeing width in the row. */}
      <span aria-hidden className="grid w-2 shrink-0 place-items-center">
        <AnimatePresence initial={false}>
          {row.positionChange !== 0 && (
            <motion.span
              key={gained ? 'gain' : 'loss'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
              className={cn(
                '[grid-area:1/1] text-[0.5rem] leading-none',
                gained ? 'text-flag-green' : 'text-primary',
              )}
            >
              {gained ? '▲' : '▼'}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {row.positionChange !== 0 && (
        <span className="sr-only">
          {`${gained ? 'gained' : 'lost'} ${moved} ${moved === 1 ? 'place' : 'places'}`}
        </span>
      )}
      {showTyre && <TyreBadge size="sm" compound={row.tyre.compound} age={row.tyre.age} />}
      {/* `showDrs` is configuration, so it unmounts the presence wrapper and never animates. */}
      {showDrs && (
        <AnimatePresence initial={false}>
          {row.drs && (
            <motion.span
              key="drs"
              {...TAG_MOTION}
              className={cn(TAG_CLASS, 'border border-flag-green text-flag-green')}
            >
              DRS
            </motion.span>
          )}
        </AnimatePresence>
      )}
      <AnimatePresence initial={false}>
        {row.inPit && (
          <motion.span
            key="pit"
            {...TAG_MOTION}
            className={cn(TAG_CLASS, 'bg-status-pit text-status-pit-foreground')}
          >
            PIT
          </motion.span>
        )}
      </AnimatePresence>
      <span className="sr-only">{valueLabel}</span>
      <TimingTowerValue value={rowValue(row, mode, isLeader)} tone={valueTone(row, isFastestLap)} />
    </motion.li>
  );
}

export function TimingTower({
  rows,
  drivers,
  teams,
  mode = 'leader',
  maxRows,
  highlightTop = 0,
  showTyre = true,
  showDrs = true,
  fastestLapDriverId = null,
  renderRow,
  className,
  ...props
}: {
  rows: TimingRow[];
  drivers: Record<string, Driver>;
  teams: Record<string, Team>;
  mode?: GapMode;
  maxRows?: number;
  highlightTop?: number;
  showTyre?: boolean;
  showDrs?: boolean;
  fastestLapDriverId?: string | null;
  renderRow?: (
    row: TimingRow,
    ctx: { driver: Driver; team: Team | undefined; index: number },
  ) => React.ReactNode;
} & React.ComponentProps<'ol'>) {
  const ordered = sortRows(rows);
  const shown = maxRows === undefined ? ordered : ordered.slice(0, Math.max(0, maxRows));

  return (
    <ol
      data-slot="timing-tower"
      data-mode={mode}
      aria-label="Timing tower"
      className={cn(
        'relative flex w-56 list-none flex-col border border-border bg-card/90 font-display text-card-foreground',
        className,
      )}
      {...props}
    >
      <LayoutGroup>
        <AnimatePresence mode="popLayout" initial={false}>
          {shown.map((row, index) => {
            const driver = drivers[row.driverId];
            if (!driver) return null;
            const team = teams[driver.teamId];
            if (renderRow) {
              return (
                <Fragment key={row.driverId}>{renderRow(row, { driver, team, index })}</Fragment>
              );
            }
            return (
              <TimingTowerRow
                key={row.driverId}
                row={row}
                driver={driver}
                team={team}
                mode={mode}
                isLeader={index === 0}
                isFastestLap={fastestLapDriverId === row.driverId}
                highlighted={index < highlightTop}
                showTyre={showTyre}
                showDrs={showDrs}
              />
            );
          })}
        </AnimatePresence>
      </LayoutGroup>
    </ol>
  );
}
