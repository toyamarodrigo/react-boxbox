import { Fragment } from 'react';
import { AnimatePresence, type HTMLMotionProps, LayoutGroup, motion } from 'motion/react';
import { DURATION, EASE_OUT, SPRING_ROW } from '@/registry/boxbox/lib/motion';
import type { Driver, ValueMode, TimingRow, Team } from '@/registry/boxbox/lib/types';
import { type OvertakeMode, OvertakeIndicator } from '@/registry/boxbox/ui/overtake-indicator';
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

const FINISH_LABELS = { dnf: 'DNF', dsq: 'DSQ', dns: 'DNS' } as const;

/** A car counts as classified until it is given a finish status other than `finished`. */
export function isClassified(row: TimingRow): boolean {
  return (row.finishStatus ?? 'finished') === 'finished';
}

/**
 * How far down a lapped car is. One spelling, used both while the race runs and in the results,
 * so the same car cannot read `+1 LAP` on one screen and `+2 LAPS` on the next. A row that says
 * it is lapped without saying by how much is one lap down.
 */
function lapsBehindValue(row: TimingRow): string {
  const laps = row.lapsBehind ?? 1;
  return laps === 1 ? '+1 LAP' : `+${laps} LAPS`;
}

/**
 * The text of the value cell in `results` mode: the winner, the gap to the
 * winner, the laps a lapped car was behind, or why the car is not classified.
 */
export function resultValue(row: TimingRow, isLeader: boolean): string {
  const status = row.finishStatus ?? 'finished';
  if (status !== 'finished') return FINISH_LABELS[status];
  if (isLeader) return 'WINNER';
  if (row.lapped) return lapsBehindValue(row);
  return formatGap(row.gapToLeader);
}

/** The text of the value cell for one row. */
export function rowValue(row: TimingRow, mode: ValueMode, isLeader: boolean): string {
  // The race is over in `results` mode, so pit and interval states no longer apply.
  if (mode === 'results') return resultValue(row, isLeader);
  // A car out of the race has no gap to show while the race is still running.
  if (!isClassified(row)) return 'OUT';
  if (row.inPit) return 'IN PIT';
  if (mode === 'lapTime') return formatLapTime(row.lastLapTime);
  // Only the gap to the leader collapses into whole laps. In `interval` mode the number is the
  // one thing a lapped car still has to say — the car ahead of it is usually on the same lap,
  // and a second away. The row keeps its lapped tone, which is what carries the lap down.
  if (row.lapped && mode === 'leader') return lapsBehindValue(row);
  if (isLeader) return 'LEADER';
  return formatGap(mode === 'interval' ? row.interval : row.gapToLeader);
}

export type TimingTowerValueTone = 'default' | 'pit' | 'lapped' | 'fastest' | 'retired';

const VALUE_TONES: Record<TimingTowerValueTone, string> = {
  default: 'text-foreground',
  pit: 'text-status-pit',
  lapped: 'text-status-lapped',
  fastest: 'text-sector-fastest',
  retired: 'text-muted-foreground',
};

function valueTone(row: TimingRow, isFastestLap: boolean, mode: ValueMode): TimingTowerValueTone {
  // A car out of the race reads muted in every mode; in a settled result nothing else differs.
  if (!isClassified(row)) return 'retired';
  if (mode === 'results') return 'default';
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

/** The points a car scored. Keeps its width when there are none, so the column stays straight. */
export function TimingTowerPoints({
  points,
  className,
  ...props
}: { points?: number | undefined } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="timing-tower-points"
      className={cn(
        'w-6 shrink-0 text-right font-mono text-xs font-bold leading-none tabular-nums',
        className,
      )}
      {...props}
    >
      {points === undefined ? '' : points}
    </span>
  );
}

const TAG_CLASS = 'shrink-0 px-1 font-mono text-[0.5rem] font-bold leading-[1.4] tracking-widest';

/**
 * `showOvertake` replaced `showDrs` when the DRS tag became the Overtake Indicator.
 * Either one set to `false` hides the tag, so the old prop keeps working on its own.
 */
export function showsOvertake(showOvertake?: boolean, showDrs?: boolean) {
  return showOvertake ?? showDrs ?? true;
}
/**
 * The value column means something different per mode, and the digits and the ▲/▼ glyph carry
 * no meaning on their own, so each gets a spoken label.
 */
const VALUE_LABELS: Record<ValueMode, string> = {
  leader: 'Gap to leader',
  interval: 'Interval',
  lapTime: 'Last lap',
  results: 'Result',
};

const TAG_MOTION = {
  initial: { opacity: 0, transform: 'translateX(-4px)' },
  animate: { opacity: 1, transform: 'translateX(0px)' },
  exit: { opacity: 0, transition: { duration: DURATION.tick, ease: EASE_OUT } },
  transition: { duration: DURATION.fast, ease: EASE_OUT },
} as const;

/**
 * The ▲/▼ glyph for a position change, plus its spoken sentence. A fixed slot: the glyph fades
 * in and out without taking or freeing width in the row.
 */
export function TimingTowerChange({ positionChange }: { positionChange: number }) {
  const gained = positionChange > 0;
  const moved = Math.abs(positionChange);
  return (
    <>
      <span aria-hidden className="grid w-2 shrink-0 place-items-center">
        <AnimatePresence initial={false}>
          {positionChange !== 0 && (
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
      {positionChange !== 0 && (
        <span className="sr-only">
          {`${gained ? 'gained' : 'lost'} ${moved} ${moved === 1 ? 'place' : 'places'}`}
        </span>
      )}
    </>
  );
}

/** What every row render slot gets alongside the row. */
export type TimingTowerRowContext = { driver: Driver; team: Team | undefined; index: number };

/**
 * The expanded panel also gets the rows either side of the followed one, in the order the tower
 * shows, so `behind.interval` is the gap back to the car behind.
 */
export type TimingTowerExpandedContext = TimingTowerRowContext & {
  ahead: TimingRow | undefined;
  behind: TimingRow | undefined;
};

/** One labelled figure of the expanded panel: a caption over a monospaced value. */
export function TimingTowerFigure({
  label,
  figure,
  children,
  className,
  ...props
}: { label: string; figure: string } & React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timing-tower-figure"
      data-figure={figure}
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{children}</span>
    </div>
  );
}

/**
 * What the expanded row shows when the consumer has not said otherwise: the figures the tower
 * already holds. Anything the component cannot know — places made up since the start, a stint
 * bar — belongs in a `renderExpanded` of your own.
 */
export function TimingTowerExpanded({
  row,
  ahead,
  behind,
  showTyre = false,
  className,
  ...props
}: {
  row: TimingRow;
  /** The row one place ahead in the shown order, for the gap it is measured against. */
  ahead?: TimingRow | undefined;
  /** The row one place behind, whose `interval` is the gap back to it. */
  behind?: TimingRow | undefined;
  showTyre?: boolean;
} & React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timing-tower-expanded-figures"
      className={cn('grid grid-cols-2 gap-x-3 gap-y-2', className)}
      {...props}
    >
      <TimingTowerFigure label="Last" figure="last">
        {formatLapTime(row.lastLapTime)}
      </TimingTowerFigure>
      <TimingTowerFigure label="Ahead" figure="ahead">
        {ahead === undefined ? EMPTY : formatGap(row.interval)}
      </TimingTowerFigure>
      <TimingTowerFigure label="Behind" figure="behind">
        {formatGap(behind?.interval ?? null)}
      </TimingTowerFigure>
      {/* The badge reads the compound and the age itself, so nothing is spelled out beside it. */}
      {showTyre && (
        <TimingTowerFigure label="Tyre" figure="tyre">
          <TyreBadge
            size="sm"
            compound={row.tyre.compound}
            age={row.tyre.age}
            wear={row.tyre.wear}
          />
        </TimingTowerFigure>
      )}
    </div>
  );
}

/**
 * The panel opens and closes as one accordion movement: its own height is what grows, so the
 * row below simply reflows with it, and `overflow-hidden` clips the figures instead of letting
 * them squash. The content fades one step faster than the height in each direction so nothing
 * pops at the edges. Height is the one property this cannot animate on the compositor, which is
 * why it is kept to this one small wrapper and the padding lives on the element inside it: with
 * padding here, `height: 0` would not be zero.
 */
const EXPANDED_MOTION = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: DURATION.fast, ease: EASE_OUT },
      opacity: { duration: DURATION.tick, ease: EASE_OUT },
    },
  },
  transition: {
    height: { duration: DURATION.base, ease: EASE_OUT },
    opacity: { duration: DURATION.fast, ease: EASE_OUT },
  },
} as const;

export function TimingTowerRow({
  row,
  driver,
  team,
  mode = 'leader',
  isLeader = false,
  isFastestLap = false,
  highlighted = false,
  followed = false,
  showTyre = true,
  showOvertake,
  showDrs,
  overtakeMode = 'drs',
  onSelect,
  expanded,
  className,
  ...props
}: {
  row: TimingRow;
  driver: Driver;
  team?: Team | undefined;
  mode?: ValueMode;
  isLeader?: boolean;
  isFastestLap?: boolean;
  highlighted?: boolean;
  /** The row the viewer is following: emphasised, and the one that carries `expanded`. */
  followed?: boolean;
  showTyre?: boolean;
  showOvertake?: boolean;
  /** @deprecated use showOvertake */
  showDrs?: boolean;
  overtakeMode?: OvertakeMode;
  /** Makes the row line a button. Without it the row is not operable at all. */
  onSelect?: () => void;
  /** A panel under the row line, shown while `followed`. */
  expanded?: React.ReactNode;
} & HTMLMotionProps<'li'>) {
  const valueLabel = VALUE_LABELS[mode];
  const results = mode === 'results';
  // A car that has left the race while it is still running: it stays listed, faded, with no tags.
  const out = !results && !isClassified(row);
  const line = (
    <>
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
      <TimingTowerChange positionChange={row.positionChange} />
      {showTyre && (
        <TyreBadge size="sm" compound={row.tyre.compound} age={row.tyre.age} wear={row.tyre.wear} />
      )}
      {/* Showing the tag is configuration, so it unmounts the presence wrapper and never animates. */}
      {!results && showsOvertake(showOvertake, showDrs) && (
        <AnimatePresence initial={false}>
          {row.drs && !out && (
            <motion.span key="overtake" {...TAG_MOTION} className="flex shrink-0">
              <OvertakeIndicator size="sm" mode={overtakeMode} state={row.drs ? 'active' : 'off'} />
            </motion.span>
          )}
        </AnimatePresence>
      )}
      <AnimatePresence initial={false}>
        {row.inPit && !out && (
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
      <TimingTowerValue
        value={rowValue(row, mode, isLeader)}
        tone={valueTone(row, isFastestLap, mode)}
      />
      {results && (
        <>
          <span className="sr-only">Points</span>
          <TimingTowerPoints points={row.points} />
        </>
      )}
    </>
  );

  return (
    <motion.li
      // `position` only: the row's own height changes when its panel opens, and that growth is
      // the accordion, not something to project. Pass `layoutDependency` (see `TimingTower`) to
      // say when the order actually changed, or Motion measures on every render — at ten renders
      // a second that turns the panel's reflow into a spring the rows below chase.
      layout="position"
      data-slot="timing-tower-row"
      data-position={row.position}
      data-driver={row.driverId}
      data-pit={String(row.inPit)}
      data-lapped={String(row.lapped)}
      data-drs={String(row.drs)}
      data-classified={results ? String(isClassified(row)) : undefined}
      data-out={out ? 'true' : undefined}
      data-followed={followed ? 'true' : undefined}
      // `y` rather than a transform string: Motion composes it with the layout
      // projection, so a row leaving past `maxRows` drops out of the bottom
      // instead of vanishing, and one climbing into view rises into its place.
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
      transition={{
        layout: SPRING_ROW,
        opacity: { duration: DURATION.base, ease: EASE_OUT },
        y: { duration: DURATION.base, ease: EASE_OUT },
      }}
      className={cn(
        'flex flex-col border-b border-border bg-card/90 text-card-foreground last:border-b-0',
        (highlighted || followed) && 'bg-primary/10',
        // A followed car that is out fades less than the rest: its panel has to stay legible.
        out && (followed ? 'opacity-80' : 'opacity-50'),
        className,
      )}
      {...props}
    >
      {onSelect ? (
        <button
          type="button"
          data-slot="timing-tower-row-button"
          aria-pressed={followed}
          onClick={onSelect}
          className="flex w-full cursor-pointer appearance-none items-center gap-2 border-0 bg-transparent py-1 pr-2 text-left text-inherit focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          // An inset accent in the team colour, rather than a border: it marks the followed row
          // without moving anything in it.
          style={
            followed ? { boxShadow: `inset 2px 0 0 0 ${team?.color ?? 'currentColor'}` } : undefined
          }
        >
          {line}
        </button>
      ) : (
        <div className="flex items-center gap-2 py-1 pr-2">{line}</div>
      )}
      {/*
       * Its own presence boundary: rows live inside the tower's `AnimatePresence initial={false}`,
       * which keeps blocking `initial` on anything that mounts later inside them.
       */}
      <AnimatePresence initial={false}>
        {followed && expanded != null && (
          <motion.div
            key="expanded"
            data-slot="timing-tower-expanded"
            // A named group of figures inside a list item; `fieldset` would mean a form.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="group"
            aria-label={`${driver.code} details`}
            className="overflow-hidden"
            {...EXPANDED_MOTION}
          >
            <div data-slot="timing-tower-expanded-content" className="px-2 pb-2">
              {expanded}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  showOvertake,
  showDrs,
  overtakeMode = 'drs',
  fastestLapDriverId = null,
  followedId = null,
  onRowClick,
  renderExpanded,
  renderRow,
  className,
  ...props
}: {
  rows: TimingRow[];
  drivers: Record<string, Driver>;
  teams: Record<string, Team>;
  mode?: ValueMode;
  maxRows?: number;
  highlightTop?: number;
  showTyre?: boolean;
  showOvertake?: boolean;
  /** @deprecated use showOvertake */
  showDrs?: boolean;
  overtakeMode?: OvertakeMode;
  fastestLapDriverId?: string | null;
  /** The driver the viewer is following: that row is emphasised and expands. */
  followedId?: string | null;
  /** Makes every default row operable. Without it no row is a button. */
  onRowClick?: (row: TimingRow, ctx: TimingTowerRowContext) => void;
  /** What the followed row shows under its line. Defaults to `TimingTowerExpanded`. */
  renderExpanded?: (row: TimingRow, ctx: TimingTowerExpandedContext) => React.ReactNode;
  renderRow?: (row: TimingRow, ctx: TimingTowerRowContext) => React.ReactNode;
} & React.ComponentProps<'ol'>) {
  const ordered = sortRows(rows);
  const shown = maxRows === undefined ? ordered : ordered.slice(0, Math.max(0, maxRows));
  /**
   * What the rows are allowed to animate their layout for: the shown order and nothing else.
   * Motion measures every `layout` component on every render unless it is given this, and a
   * live tower renders ten times a second. `followedId` is deliberately not part of it —
   * following is what opens the panel, and the rows below must ride that height animation
   * rather than be re-measured and sprung into place a frame behind it.
   */
  const order = shown.map((row) => row.driverId).join(',');

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
            const ctx = { driver, team, index };
            if (renderRow) {
              return <Fragment key={row.driverId}>{renderRow(row, ctx)}</Fragment>;
            }
            const followed = followedId !== null && followedId === row.driverId;
            // Neighbours in the shown order, so an expanded panel can name the car behind.
            const ahead = shown[index - 1];
            const behind = shown[index + 1];
            return (
              <TimingTowerRow
                key={row.driverId}
                layoutDependency={order}
                row={row}
                driver={driver}
                team={team}
                mode={mode}
                isLeader={index === 0}
                isFastestLap={fastestLapDriverId === row.driverId}
                highlighted={index < highlightTop}
                followed={followed}
                showTyre={showTyre}
                showOvertake={showsOvertake(showOvertake, showDrs)}
                overtakeMode={overtakeMode}
                onSelect={onRowClick === undefined ? undefined : () => onRowClick(row, ctx)}
                expanded={
                  !followed ? undefined : renderExpanded ? (
                    renderExpanded(row, { ...ctx, ahead, behind })
                  ) : (
                    <TimingTowerExpanded
                      row={row}
                      ahead={ahead}
                      behind={behind}
                      showTyre={showTyre}
                    />
                  )
                }
              />
            );
          })}
        </AnimatePresence>
      </LayoutGroup>
    </ol>
  );
}
