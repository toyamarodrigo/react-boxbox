import { Fragment } from 'react';
import { type HTMLMotionProps, motion } from 'motion/react';
import { DURATION, EASE_OUT, SPRING_ROW } from '@/registry/boxbox/lib/motion';
import type { Driver, GapMode, TimingRow, Team } from '@/registry/boxbox/lib/types';
import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';
import { cn } from '@/lib/utils';

const EMPTY = '—';
const FLASH_GAIN = 'rgba(45, 180, 110, 0.45)';
const FLASH_LOSS = 'rgba(220, 60, 60, 0.45)';
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

export function TimingTowerPosition({
  position,
  positionChange = 0,
  className,
  ...props
}: { position: number; positionChange?: number } & HTMLMotionProps<'div'>) {
  const flash = positionChange > 0 ? FLASH_GAIN : positionChange < 0 ? FLASH_LOSS : undefined;
  return (
    <motion.div
      key={`${position}:${positionChange}`}
      data-slot="timing-tower-position"
      initial={false}
      animate={{ backgroundColor: flash ? [flash, FLASH_IDLE] : FLASH_IDLE }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT }}
      className={cn(
        'grid w-7 shrink-0 place-items-center self-stretch font-display text-sm font-black leading-none tabular-nums',
        className,
      )}
      {...props}
    >
      {position}
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
        'ml-auto overflow-hidden text-right font-mono text-xs font-bold leading-none tabular-nums',
        VALUE_TONES[tone],
        className,
      )}
      {...props}
    >
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.fast, ease: EASE_OUT }}
        className="block"
      >
        {value}
      </motion.span>
    </div>
  );
}

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
  return (
    <motion.li
      layout
      data-slot="timing-tower-row"
      data-position={row.position}
      data-driver={row.driverId}
      data-pit={String(row.inPit)}
      data-lapped={String(row.lapped)}
      data-drs={String(row.drs)}
      transition={SPRING_ROW}
      className={cn(
        'flex items-center gap-2 border-b border-border bg-card/90 py-1 pr-2 text-card-foreground last:border-b-0',
        highlighted && 'bg-primary/10',
        className,
      )}
      {...props}
    >
      <TimingTowerPosition position={row.position} positionChange={row.positionChange} />
      <span
        aria-hidden
        className="h-6 w-[3px] shrink-0 bg-muted"
        style={team ? { backgroundColor: team.color } : undefined}
      />
      <span className="font-display text-sm font-bold uppercase leading-none tracking-wider">
        {driver.code}
      </span>
      {row.positionChange !== 0 && (
        <span
          aria-hidden
          className={cn('text-[0.5rem] leading-none', gained ? 'text-flag-green' : 'text-primary')}
        >
          {gained ? '▲' : '▼'}
        </span>
      )}
      {showTyre && <TyreBadge size="sm" compound={row.tyre.compound} age={row.tyre.age} />}
      {showDrs && row.drs && (
        <span className="border border-flag-green px-1 font-mono text-[0.5rem] font-bold leading-[1.4] tracking-widest text-flag-green">
          DRS
        </span>
      )}
      {row.inPit && (
        <span className="bg-status-pit px-1 font-mono text-[0.5rem] font-bold leading-[1.4] tracking-widest text-status-pit-foreground">
          PIT
        </span>
      )}
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
        'flex w-56 list-none flex-col border border-border bg-card/90 font-display text-card-foreground',
        className,
      )}
      {...props}
    >
      {shown.map((row, index) => {
        const driver = drivers[row.driverId];
        if (!driver) return null;
        const team = teams[driver.teamId];
        if (renderRow) {
          return <Fragment key={row.driverId}>{renderRow(row, { driver, team, index })}</Fragment>;
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
    </ol>
  );
}
