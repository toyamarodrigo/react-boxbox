import { memo, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  LAP_GRID_DELTA_CAP_MS,
  LAP_GRID_MEASURES,
  type LapGridCell,
  type LapGridMeasure,
  type LapGridStatus,
  hasSectorTimes,
  lapGrid,
  lapGridIntensity,
  lapGridSummary,
  lapGridTooltip,
  lapGridVisible,
} from '@/data/replay-lap-grid';
import type { ReplayRace } from '@/data/replay-schema';
import { cn } from '@/lib/utils';
import { SPRING_ROW } from '@/registry/boxbox/lib/motion';
import type { TimingRow } from '@/registry/boxbox/lib/types';
import { isClassified } from '@/registry/boxbox/ui/timing-tower';
import { Button } from '@/components/ui/button';

const MEASURE_LABELS: Record<LapGridMeasure, string> = {
  lap: 'Lap',
  s1: 'S1',
  s2: 'S2',
  s3: 'S3',
};

/**
 * What the grid measures: the lap, or one of its sectors. Buttons for the same reason the page's
 * other pickers are — it re-renders ten times a second, which is no place for a popover.
 */
function MeasurePicker({
  value,
  onSelect,
}: {
  value: LapGridMeasure;
  onSelect: (measure: LapGridMeasure) => void;
}) {
  return (
    <fieldset aria-label="Lap grid measure" className="flex items-center gap-1">
      {LAP_GRID_MEASURES.map((measure) => (
        <Button
          key={measure}
          variant={measure === value ? 'default' : 'outline'}
          size="sm"
          aria-pressed={measure === value}
          onClick={() => onSelect(measure)}
        >
          {MEASURE_LABELS[measure]}
        </Button>
      ))}
    </fieldset>
  );
}

/**
 * The Flag Banner's diagonal stripe, in the grey of a lap that does not count rather than a flag's
 * colour, at the cell's scale: the banner's own period is wider than a cell.
 */
const STRIPE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, transparent 0 2px, var(--muted-foreground) 2px 3px)',
};

/** The sector card's purple and green; a slower lap takes the ramp below instead. */
const STATUS_CLASSES: Record<LapGridStatus, string> = {
  fastest: 'bg-sector-fastest',
  personal: 'bg-sector-personal',
  slower: '',
  excluded: 'bg-muted',
  unset: 'bg-muted',
};

/**
 * The one ramp every slower lap takes: the sector card's amber, from a quarter of its strength at
 * the personal best to all of it at the cap. The same mix Tailwind writes for `bg-sector-slower/50`,
 * only continuous.
 */
function slowerColor(deltaMs: number): string {
  const share = Math.round(25 + 75 * lapGridIntensity(deltaMs));
  return `color-mix(in oklab, var(--sector-slower) ${share}%, transparent)`;
}

function cellStyle(cell: LapGridCell): React.CSSProperties {
  // Placed by lap rather than by order, so a column is the same lap on every row.
  const place = { gridColumnStart: cell.lap };
  if (cell.status === 'slower') {
    return { ...place, backgroundColor: slowerColor(cell.deltaMs ?? 0) };
  }
  if (cell.status === 'excluded') return { ...place, ...STRIPE };
  return place;
}

/**
 * Narrowest a lap column may get before the grid scrolls sideways instead: 69 laps (the longest
 * curated race) then fit the panel on a desktop, and a phone scrolls with the driver pinned.
 */
const MIN_CELL_PX = 7;

const NO_CELLS: readonly LapGridCell[] = [];

/**
 * One car's laps. Memoised on what it draws: the panel re-renders ten times a second, and a row
 * only changes when its car completes a lap, the measure changes or the car is followed. The cells
 * themselves are decorative; the button carries the row's one spoken sentence instead.
 */
const LapGridLine = memo(function LapGridLine({
  driverId,
  code,
  color,
  cells,
  visible,
  measure,
  totalLaps,
  followed,
  out,
  order,
  onFollow,
}: {
  driverId: string;
  code: string;
  color: string;
  cells: readonly LapGridCell[];
  /** How many of the cells the clock has reached. */
  visible: number;
  measure: LapGridMeasure;
  totalLaps: number;
  followed: boolean;
  out: boolean;
  /** The shown order, which is all the row may animate its layout for (see `TimingTower`). */
  order: string;
  onFollow: (driverId: string) => void;
}) {
  const shown = cells.slice(0, visible);
  return (
    <motion.li
      layout="position"
      layoutDependency={order}
      transition={{ layout: SPRING_ROW }}
      data-slot="lap-grid-row"
      data-driver={driverId}
      data-followed={followed ? 'true' : undefined}
      data-out={out ? 'true' : undefined}
      className={cn(
        'flex items-center',
        followed && 'bg-primary/10',
        // The tower's fade for a car out of the race, and its lighter one when it is followed.
        out && (followed ? 'opacity-80' : 'opacity-50'),
      )}
    >
      <button
        type="button"
        data-slot="lap-grid-driver"
        aria-pressed={followed}
        onClick={() => onFollow(driverId)}
        className={cn(
          // Pinned, so a phone scrolling through the laps still sees whose they are. Opaque, or
          // the cells would show through it as they pass underneath.
          'sticky left-0 z-10 flex w-14 shrink-0 cursor-pointer items-center gap-1.5 px-2 py-0.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          followed ? 'bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]' : 'bg-card',
        )}
        // The tower's inset accent in the team colour for the followed row.
        style={followed ? { boxShadow: `inset 2px 0 0 0 ${color}` } : undefined}
      >
        <span aria-hidden className="h-3 w-[3px] shrink-0" style={{ backgroundColor: color }} />
        <span aria-hidden className="font-mono text-[11px] font-bold uppercase tracking-wider">
          {code}
        </span>
        <span className="sr-only">{lapGridSummary(code, shown, measure)}</span>
      </button>
      <div
        aria-hidden
        data-slot="lap-grid-cells"
        className="grid flex-1 gap-px py-0.5 pr-2"
        style={{
          gridTemplateColumns: `repeat(${totalLaps}, minmax(0, 1fr))`,
          minWidth: totalLaps * MIN_CELL_PX,
        }}
      >
        {shown.map((cell) => (
          <span
            key={cell.lap}
            data-slot="lap-grid-cell"
            data-status={cell.status}
            // A native tooltip: nothing to measure or position while the clock runs.
            title={lapGridTooltip(cell, measure)}
            className={cn('h-3', STATUS_CLASSES[cell.status])}
            style={cellStyle(cell)}
          />
        ))}
      </div>
    </motion.li>
  );
});

function Legend() {
  const swatch = 'h-3 w-3 shrink-0';
  return (
    <ul
      aria-label="Lap grid legend"
      className="flex list-none flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(swatch, 'bg-sector-fastest')} />
        Race best
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(swatch, 'bg-sector-personal')} />
        Personal best
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-3 w-8 shrink-0"
          style={{
            backgroundImage: `linear-gradient(to right, ${slowerColor(0)}, ${slowerColor(LAP_GRID_DELTA_CAP_MS)})`,
          }}
        />
        {`Slower, deeper up to +${(LAP_GRID_DELTA_CAP_MS / 1000).toFixed(1)} s`}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(swatch, 'bg-muted')} style={STRIPE} />
        Not counted: lap 1, pit in and out, safety car, VSC, red flag
      </li>
    </ul>
  );
}

/**
 * The Lap grid: every car's laps in the tower's order, one column per lap, coloured as of the lap
 * each was set. Only laps the clock has completed are drawn, so it never gives the race away.
 *
 * The cells are built once per race and measure (`lapGrid`); a tick only moves each row's count
 * of visible cells, which is a binary search, and a row re-renders only when that count moves.
 */
export function LapGrid({
  race,
  rows,
  elapsedMs,
  finished,
  measure,
  onMeasure,
  followedId,
  onFollow,
}: {
  race: ReplayRace;
  /** The tower's rows, for the order: running cars first, then the ones out of the race. */
  rows: readonly TimingRow[];
  elapsedMs: number;
  /** At the flag every lap is shown, including a lapped car's, which ends after the leader's. */
  finished: boolean;
  measure: LapGridMeasure;
  onMeasure: (measure: LapGridMeasure) => void;
  followedId: string | undefined;
  onFollow: (driverId: string) => void;
}) {
  const sectors = useMemo(() => hasSectorTimes(race), [race]);
  // A race with no sector times shows the lap, whatever was picked on the last race.
  const shownMeasure = sectors ? measure : 'lap';
  const grid = useMemo(() => lapGrid(race, shownMeasure), [race, shownMeasure]);
  const drivers = useMemo(() => new Map(race.drivers.map((d) => [d.id, d])), [race]);
  const teams = useMemo(() => new Map(race.teams.map((team) => [team.id, team])), [race]);
  const order = rows.map((row) => row.driverId).join(',');

  return (
    <div className="flex flex-col gap-3">
      {sectors && <MeasurePicker value={shownMeasure} onSelect={onMeasure} />}
      <div className="overflow-x-auto">
        <ul aria-label="Lap grid" className="flex w-max min-w-full list-none flex-col">
          {rows.map((row) => {
            const driver = drivers.get(row.driverId);
            if (!driver) return null;
            const cells = grid.get(row.driverId) ?? NO_CELLS;
            return (
              <LapGridLine
                key={row.driverId}
                driverId={row.driverId}
                code={driver.code}
                color={teams.get(driver.teamId)?.color ?? 'currentColor'}
                cells={cells}
                visible={finished ? cells.length : lapGridVisible(cells, elapsedMs)}
                measure={shownMeasure}
                totalLaps={race.totalLaps}
                followed={row.driverId === followedId}
                out={!isClassified(row)}
                order={order}
                onFollow={onFollow}
              />
            );
          })}
        </ul>
      </div>
      <Legend />
      <p className="text-xs text-muted-foreground">
        Each lap keeps the colour it had when it was set. Hover a cell for its time; click a driver
        to follow them.
      </p>
    </div>
  );
}
