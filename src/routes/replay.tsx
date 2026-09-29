import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useState,
} from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from 'cn';
import { z } from 'zod';
import type {
  ReplayIndexEntry,
  ReplayRace,
  ReplayRaceControl,
  ReplayStint,
} from '../data/replay-schema';
import type { RaceReplay, ReplaySpeed } from '../data/use-race-replay';
import { REPLAY_MARKER_TRANSITION_MS, REPLAY_SPEEDS, useRaceReplay } from '../data/use-race-replay';
import {
  type NeutralisationPeriod,
  type NeutralisationStatus,
  type PitLaneShape,
  type ReplayPitStop,
  carLapsAt,
  emphasiseMarker,
  flaggedSectorsAt,
  followedDriverId,
  formatRaceTime,
  hasTimingData,
  leaderLapsCompleted,
  neutralisationSummary,
  overtakeModeFor,
  positionsSinceStart,
  raceControlUpTo,
  replayGaps,
  replayPodium,
  sectorCardAt,
  speedTrapAt,
  speedTrapBestAt,
  stintAt,
  trackStatusAt,
} from '../data/replay-timing';
import { byDateDescending, formatRaceDate } from '../data/replay-index';
import type { LapGridMeasure } from '../data/replay-lap-grid';
import { useReplayIndex, useReplayRace } from '../data/use-replay-data';
import { type ReplayCircuit, circuitForRace } from '../data/circuit-for-race';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { SectorStatus, SectorTime, TimingRow, TrackMarker } from '@/registry/boxbox/lib/types';
import { FlagBanner } from '@/registry/boxbox/ui/flag-banner';
import type { GapChartSeries } from '@/registry/boxbox/ui/gap-chart';
import { LapCounter } from '@/registry/boxbox/ui/lap-counter';
import { Podium } from '@/registry/boxbox/ui/podium';
import { RaceClock } from '@/registry/boxbox/ui/race-clock';
import { SectorTimes } from '@/registry/boxbox/ui/sector-times';
import { SpeedTrap } from '@/registry/boxbox/ui/speed-trap';
import { StintBar } from '@/registry/boxbox/ui/stint-bar';
import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';
import {
  type TimingTowerExpandedContext,
  TimingTower,
  TimingTowerFigure,
  formatGap,
  formatLapTime,
  positionChangeState,
} from '@/registry/boxbox/ui/timing-tower';
import { TrackMap } from '@/registry/boxbox/ui/track-map';
import { LapGrid } from '../components/site/replay/lap-grid';
import { Button } from '../components/ui/button';
import { Slider } from '../components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { seo } from '../lib/seo';

/** The two things the tower's value column can measure here; `lapTime` is a docs-only mode. */
const VALUE_MODES = ['leader', 'interval'] as const;
type TowerValueMode = (typeof VALUE_MODES)[number];

/**
 * A race is addressed by season and round, the way the source API addresses it, so a link to
 * `/replay?season=2025&round=1` keeps working when the curated list changes order.
 */
const searchSchema = z.object({
  season: z.coerce.number().int().min(1950).optional(),
  round: z.coerce.number().int().min(1).optional(),
  /** The followed driver, by the code the tower shows. An unknown one is ignored. */
  driver: z.string().optional(),
  /**
   * What the tower's value column measures. `.catch()` rather than a bare enum because
   * `validateSearch` parses this, so an unknown value would raise a route error and turn a
   * mistyped link into a broken page instead of the default view. Absent is the default, which
   * is how `leader` stays out of the URL.
   */
  value: z.enum(VALUE_MODES).optional().catch(undefined),
});

export const Route = createFileRoute('/replay')({
  // `validateSearch` goes first so the router can infer the search type for the rest.
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: seo({
      title: 'Replay — boxbox',
      description:
        'Play a real grand prix back through the boxbox components: timing tower, lap counter, race clock and track map, from static lap-time data.',
      path: '/replay',
    }),
  }),
  component: ReplayPage,
});

const JOLPICA_URL = 'https://github.com/jolpica/jolpica-f1';

function Message({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <output className="flex flex-wrap items-center gap-4 border border-border bg-card p-6 text-sm text-muted-foreground">
      <span>{children}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </output>
  );
}

/**
 * A row of buttons rather than a `Select`: the curated list is short, every race stays one
 * click away, and the page re-renders ten times a second while a replay runs, which is no place
 * for a popover that has to re-measure itself on every tick.
 */
function RacePicker({
  races,
  value,
  onSelect,
}: {
  races: readonly ReplayIndexEntry[];
  value: string | undefined;
  onSelect: (entry: ReplayIndexEntry) => void;
}) {
  return (
    <fieldset aria-label="Race" className="flex flex-wrap gap-2">
      {races.map((race) => (
        <Button
          key={race.id}
          variant={race.id === value ? 'default' : 'outline'}
          size="sm"
          aria-pressed={race.id === value}
          onClick={() => onSelect(race)}
        >
          {`${race.season} ${race.name.replace(/\s*Grand Prix$/, '')}`}
        </Button>
      ))}
    </fieldset>
  );
}

/** The glossary words, the ones the tower already speaks over the column. */
const VALUE_MODE_LABELS: Record<TowerValueMode, string> = { leader: 'Gap', interval: 'Interval' };

/**
 * What the tower's value column measures: the gap to the leader, or the interval to the car one
 * place ahead. Two buttons for the same reason `RacePicker` is a row of them — the page renders
 * ten times a second, which is no place for a popover.
 */
function ValueModePicker({
  value,
  onSelect,
}: {
  value: TowerValueMode;
  onSelect: (mode: TowerValueMode) => void;
}) {
  return (
    <fieldset aria-label="Timing column" className="ml-auto flex items-center gap-1">
      {VALUE_MODES.map((mode) => (
        <Button
          key={mode}
          variant={mode === value ? 'default' : 'outline'}
          size="sm"
          aria-pressed={mode === value}
          onClick={() => onSelect(mode)}
        >
          {VALUE_MODE_LABELS[mode]}
        </Button>
      ))}
    </fieldset>
  );
}

/**
 * Pit stops hang under the bar in the pit colour, one mark per stop. Each mark is a button with
 * a hit area wider than its one-pixel tick: hovering or focusing it names the stop, clicking it
 * seeks there. The marks sit below the slider so they never take a drag away from it.
 *
 * Memoised on the stops alone: the page renders ten times a second while a replay runs and a
 * race can have forty stops, none of which change until the race does.
 */
const PitStopMarks = memo(function PitStopMarks({
  stops,
  endMs,
  disabled,
  onSeek,
}: {
  stops: readonly ReplayPitStop[];
  endMs: number;
  disabled: boolean;
  onSeek: (ms: number) => void;
}) {
  if (stops.length === 0) return null;
  return (
    <TooltipProvider delayDuration={150}>
      {stops.map((stop) => {
        const label = `${stop.code} pit stop${stop.stop === null ? '' : ` ${stop.stop}`}, lap ${stop.lap}, ${(stop.durationMs / 1000).toFixed(1)}s`;
        return (
          <Tooltip key={`${stop.driverId}:${stop.lap}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-slot="timeline-pit-stop"
                aria-label={label}
                disabled={disabled}
                className="absolute bottom-0 flex h-3 w-3 -translate-x-1/2 justify-center focus-visible:outline-hidden focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring/50"
                style={{ left: `${endMs > 0 ? (stop.atMs / endMs) * 100 : 0}%` }}
                onClick={() => onSeek(stop.atMs)}
              >
                <span aria-hidden className="h-1 w-px bg-status-pit" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-[10px] tabular-nums">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </TooltipProvider>
  );
});

/**
 * The bands keep the Flag Banner's vocabulary, so a stretch of the bar is painted the colour the
 * banner flew over it: the safety car and the virtual safety car share the yellow, and the stripe
 * is what tells them apart, exactly as the banner tells a double yellow from a single one.
 */
const NEUTRALISATION_TONES: Record<NeutralisationStatus, string> = {
  sc: 'bg-flag-yellow',
  vsc: 'bg-flag-yellow',
  red: 'bg-flag-red',
};

/**
 * The banner's diagonal stripe at the band's scale: its own 14px/18px period is wider than a band
 * is tall, so at that size a band would come out a plain yellow block with one wedge cut off it.
 * The angle, the transparency and the colour are the banner's.
 */
const NEUTRALISATION_PATTERNS: Partial<Record<NeutralisationStatus, React.CSSProperties>> = {
  vsc: {
    backgroundImage:
      'repeating-linear-gradient(45deg, transparent 0 4px, var(--flag-yellow-foreground) 4px 6px)',
  },
};

/**
 * Where the race was neutralised, in a row of its own under the bar.
 *
 * Decorative and inert: a band sits over the stretch of bar the viewer drags to, so anything
 * clickable here would take the drag away from the slider, which is the bar's whole job. The
 * spoken summary on the slider says in one sentence what the bands say in colour.
 *
 * Memoised on the periods and the length of the race, like `PitStopMarks`: the page renders ten
 * times a second and these never move for the whole of a race.
 */
const NeutralisationBands = memo(function NeutralisationBands({
  periods,
  endMs,
}: {
  periods: readonly NeutralisationPeriod[];
  endMs: number;
}) {
  // No row at all rather than an empty one, so a race with nothing to show has no gap under it.
  if (periods.length === 0 || endMs <= 0) return null;
  return (
    <div
      aria-hidden
      data-slot="timeline-neutralisations"
      className="pointer-events-none relative mt-2 h-1.5"
    >
      {periods.map((period) => (
        <span
          key={`${period.status}:${period.fromMs}`}
          data-slot="timeline-neutralisation"
          data-status={period.status}
          className={cn('absolute inset-y-0 min-w-[3px]', NEUTRALISATION_TONES[period.status])}
          style={{
            left: `${(period.fromMs / endMs) * 100}%`,
            width: `${((period.toMs - period.fromMs) / endMs) * 100}%`,
            ...NEUTRALISATION_PATTERNS[period.status],
          }}
        />
      ))}
    </div>
  );
});

/**
 * The race on one bar: drag anywhere in the race, with a tick at every lap boundary and the lap
 * in progress riding on the thumb. Seeking is live while dragging; the map snaps rather than
 * slides on those renders (see `RaceReplay.jumped`).
 */
function Timeline({ replay, disabled }: { replay: RaceReplay; disabled: boolean }) {
  const { endMs, lapBoundaries, neutralisations, pitStops, totalLaps } = replay;
  const percent = (ms: number) => (endMs > 0 ? (ms / endMs) * 100 : 0);
  /**
   * The summary describes the slider rather than labelling it: a description is read once, when
   * the control takes focus, where `aria-valuetext` is read again on every tick of the clock.
   */
  const summaryId = useId();
  const summary = useMemo(() => neutralisationSummary(neutralisations), [neutralisations]);

  return (
    <div className="relative pt-6 pb-3">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-3 top-6">
        {/* Interior boundaries only: the first and last lap end where the bar does. */}
        {lapBoundaries.slice(1, totalLaps).map((ms, index) => (
          <span
            key={index}
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/25"
            style={{ left: `${percent(ms)}%` }}
          />
        ))}
      </div>
      <PitStopMarks stops={pitStops} endMs={endMs} disabled={disabled} onSeek={replay.seek} />
      <Slider
        value={[replay.elapsedMs]}
        min={0}
        max={Math.max(endMs, 1)}
        step={1000}
        disabled={disabled || endMs === 0}
        onValueChange={([ms]) => ms !== undefined && replay.seek(ms)}
        thumbProps={{
          'aria-label': 'Race time',
          'aria-valuetext': `Lap ${replay.lap} of ${totalLaps}, ${formatRaceTime(replay.elapsedMs)}`,
          'aria-describedby': summary === null ? undefined : summaryId,
          className: 'relative',
          children: (
            <span
              aria-hidden
              className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums leading-none text-foreground"
            >
              {`L${replay.lap}`}
            </span>
          ),
        }}
      />
      <NeutralisationBands periods={neutralisations} endMs={endMs} />
      {summary !== null && (
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
      )}
    </div>
  );
}

function Controls({ replay, disabled }: { replay: RaceReplay; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-3 border border-border bg-card p-3">
      <fieldset aria-label="Replay controls" className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={disabled || replay.finished}
          onClick={() => (replay.isPlaying ? replay.pause() : replay.play())}
        >
          {replay.isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {replay.isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={replay.restart}>
          <RotateCcw aria-hidden="true" />
          Restart
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <fieldset className="flex items-center gap-1" aria-label="Replay speed">
            {REPLAY_SPEEDS.map((speed: ReplaySpeed) => (
              <Button
                key={speed}
                variant={replay.speed === speed ? 'default' : 'outline'}
                size="sm"
                disabled={disabled}
                aria-pressed={replay.speed === speed}
                onClick={() => replay.setSpeed(speed)}
              >
                {`${speed}×`}
              </Button>
            ))}
          </fieldset>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous lap"
            disabled={disabled || replay.lap <= 1}
            onClick={replay.previousLap}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next lap"
            disabled={disabled || replay.lap >= replay.totalLaps}
            onClick={replay.nextLap}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </fieldset>
      <Timeline replay={replay} disabled={disabled} />
    </div>
  );
}

const EMPTY = '—';

/** Gain / loss tones, the ones the tower's own ▲ / ▼ glyph uses. */
const CHANGE_TONES = {
  gain: 'text-flag-green',
  loss: 'text-primary',
  none: 'text-foreground',
} as const;

/**
 * Recharts is the one heavy dependency on the page and only the Gaps tab needs it, so the chart
 * arrives when that tab is first opened rather than in the bundle every viewer downloads.
 */
const GapChart = lazy(() =>
  import('@/registry/boxbox/ui/gap-chart').then((module) => ({ default: module.GapChart })),
);

/** A car's stints by driver id: one lookup per race rather than a scan per render. */
type StintsByDriver = Map<string, ReplayStint[]>;

const stintsByDriver = (race: ReplayRace): StintsByDriver =>
  new Map(race.stints.map((car) => [car.driverId, car.stints]));

/**
 * The set of tyres a car is on now. A stint whose compound nobody recorded has no badge to
 * draw: the compound is the whole content of one, and a grey ring with a letter would be a
 * guess. It reads as a question mark instead, the way its stint bar segment does.
 */
function FollowedTyre({ stint, lap }: { stint: ReplayStint | undefined; lap: number }) {
  if (stint?.compound == null) {
    return (
      <span title="compound unknown" className="text-muted-foreground">
        ?<span className="sr-only"> compound unknown</span>
      </span>
    );
  }
  return <TyreBadge size="sm" compound={stint.compound} age={Math.max(0, lap - stint.fromLap)} />;
}

/**
 * Places made up since the grid. Its own component so the panel around it stays one list of
 * figures: the arrow and the sentence under it are two spellings of one number, and neither the
 * tower nor this page has anywhere else to put them.
 */
function PlacesMade({ made }: { made: number | null }) {
  return (
    <TimingTowerFigure label="Since start" figure="places">
      {/* The arrow carries the direction, so the sentence below it carries the meaning. */}
      <span aria-hidden className={CHANGE_TONES[positionChangeState(made ?? 0)]}>
        {made === null || made === 0 ? EMPTY : `${made > 0 ? '▲' : '▼'}${Math.abs(made)}`}
      </span>
      <span className="sr-only">
        {made === null
          ? 'no grid slot'
          : made === 0
            ? 'no places made up'
            : `${made > 0 ? 'gained' : 'lost'} ${Math.abs(made)} since the start`}
      </span>
    </TimingTowerFigure>
  );
}

/**
 * What the followed row shows on this page: the tower's own figures, the places the car has made
 * up since the grid, and its tyres — both of which the registry cannot know.
 *
 * With real timing the `LAST` figure gives way to `SectorTimes`, which says the same lap time and
 * three sectors more; the remaining three figures then fit on one line, so the panel grows by the
 * sector card alone. A race OpenF1 never covered keeps the old four figures rather than a card of
 * em dashes nothing in that race will ever fill.
 *
 * Every line has a height of its own, because the tower's panel measures itself once as it opens
 * and anything that grew afterwards would hang out of it. The sector card is no exception: its
 * bars and both text sizes are fixed, so an unset sector is exactly as tall as a set one.
 */
function FollowedFigures({
  race,
  row,
  ahead,
  behind,
  stints,
  lap,
  card,
}: {
  race: ReplayRace;
  row: TimingRow;
  ahead: TimingRow | undefined;
  behind: TimingRow | undefined;
  stints: StintsByDriver;
  /** The lap this car is on, which is not the leader's lap. */
  lap: number;
  /**
   * The car's sector card — one lap's three sectors and, once it is over, its time. Absent when
   * the race carries no timing at all.
   */
  card:
    | {
        sectors: [SectorTime, SectorTime, SectorTime];
        lapTime: number | null;
        lapStatus: SectorStatus;
      }
    | undefined;
}) {
  const made = positionsSinceStart(race, row.driverId, row.position);
  const own = stints.get(row.driverId);

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('grid gap-x-3 gap-y-2', card ? 'grid-cols-3' : 'grid-cols-2')}>
        {card === undefined && (
          <TimingTowerFigure label="Last" figure="last">
            {formatLapTime(row.lastLapTime)}
          </TimingTowerFigure>
        )}
        <TimingTowerFigure label="Ahead" figure="ahead">
          {ahead === undefined ? EMPTY : formatGap(row.interval)}
        </TimingTowerFigure>
        <TimingTowerFigure label="Behind" figure="behind">
          {formatGap(behind?.interval ?? null)}
        </TimingTowerFigure>
        <PlacesMade made={made} />
      </div>
      {card && (
        <SectorTimes
          sectors={card.sectors}
          // The card's own lap, so the three sectors, the time they add up to and its colour all
          // describe one lap. Null while that lap is still being run, which is what `unset` means.
          lapTime={card.lapTime}
          lapStatus={card.lapStatus}
          className="gap-2 p-2"
        />
      )}
      <div className="flex h-11 items-center gap-3">
        <TimingTowerFigure label="Tyre" figure="tyre" className="w-12 shrink-0">
          <FollowedTyre stint={stintAt(own, lap)} lap={lap} />
        </TimingTowerFigure>
        <StintBar
          size="sm"
          stints={own ?? []}
          totalLaps={race.totalLaps}
          currentLap={lap}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}

/**
 * The last trap reading under the tower: the followed car's, or the leader's when nobody is
 * followed. Memoised on the plain values it draws rather than on the race clock, because the
 * column re-renders ten times a second and the trap only fires as a car crosses the line — the
 * same reason `StrategyLine` and `PitStopMarks` are memoised. The session best is taken apart
 * into two values for that: an object rebuilt every tick would defeat the shallow comparison.
 */
const SpeedTrapCard = memo(function SpeedTrapCard({
  code,
  color,
  speed,
  bestCode,
  bestSpeed,
}: {
  code: string;
  color: string | undefined;
  speed: number | null;
  bestCode: string | undefined;
  bestSpeed: number | null;
}) {
  const sessionBest =
    bestCode === undefined || bestSpeed === null ? null : { code: bestCode, speed: bestSpeed };
  return (
    <SpeedTrap
      // The readings are km/h, which is what OpenF1 publishes.
      unit="kph"
      code={code}
      color={color}
      speed={speed}
      sessionBest={sessionBest}
      className="w-full"
    />
  );
});

function Stage({
  race,
  replay,
  stints,
  pit,
  followedId,
  onFollow,
  valueMode,
  onValueMode,
}: {
  race: ReplayRace;
  replay: RaceReplay;
  stints: StintsByDriver;
  pit: PitLaneShape | undefined;
  followedId: string | undefined;
  onFollow: (driverId: string) => void;
  valueMode: TowerValueMode;
  onValueMode: (mode: TowerValueMode) => void;
}) {
  const drivers = useMemo(
    () => Object.fromEntries(race.drivers.map((driver) => [driver.id, driver])),
    [race],
  );
  const teams = useMemo(
    () => Object.fromEntries(race.teams.map((team) => [team.id, team])),
    [race],
  );
  const podium = useMemo(
    () => (replay.finished ? replayPodium(race) : null),
    [race, replay.finished],
  );

  /**
   * The lap the followed car is on, which is its own, not the leader's. A car that has no lap in
   * progress — retired, or the race is over — keeps the last lap of its last stint, so its bar
   * stays as full as its race was.
   */
  const followedLap = useMemo(() => {
    if (followedId === undefined) return 0;
    const running = carLapsAt(race, replay.elapsedMs, pit).get(followedId)?.lap;
    return running ?? stints.get(followedId)?.at(-1)?.toLap ?? 0;
  }, [followedId, race, replay.elapsedMs, pit, stints]);

  /**
   * Whether this race has any OpenF1 timing. 2021-22 Abu Dhabi has none, and neither the sector
   * card nor the speed trap can ever fill there, so both give way rather than sit empty for the
   * whole race. Decided from the laps themselves, not from the season.
   */
  const timed = useMemo(() => hasTimingData(race), [race]);

  /**
   * The followed car's sector card: the lap it has just finished until it completes a sector of
   * the new one, then that lap filling in. Sectors and lap time always describe the same lap.
   */
  const followedCard = useMemo(
    () =>
      !timed || followedId === undefined
        ? undefined
        : sectorCardAt(race, followedId, followedLap, replay.elapsedMs),
    [timed, followedId, race, followedLap, replay.elapsedMs],
  );

  // The trap card follows the followed car, and the leader when the viewer follows nobody.
  const trapDriver = drivers[followedId ?? replay.rows[0]?.driverId ?? ''];
  const trapSpeed =
    trapDriver === undefined ? null : speedTrapAt(race, trapDriver.id, replay.elapsedMs);
  const trapBest = useMemo(
    () => (timed ? speedTrapBestAt(race, replay.elapsedMs) : null),
    [timed, race, replay.elapsedMs],
  );

  // Both are handed to the tower on every tick, so neither may be a fresh value each render.
  const handleRowClick = useCallback((row: TimingRow) => onFollow(row.driverId), [onFollow]);
  const renderExpanded = useCallback(
    (row: TimingRow, ctx: TimingTowerExpandedContext) => (
      <FollowedFigures
        race={race}
        row={row}
        ahead={ctx.ahead}
        behind={ctx.behind}
        stints={stints}
        lap={followedLap}
        card={followedCard}
      />
    ),
    [race, stints, followedLap, followedCard],
  );

  return (
    // On wide screens the tower pins under the site header and never grows past the viewport,
    // scrolling inside instead. It is the tallest column, so if it set the page's height the
    // expanded row would grow and shrink the whole document, and a viewer at the bottom of the
    // page would see the map and the tower ride that accordion.
    <div className="flex flex-col gap-4 border border-border bg-card p-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3">
        <LapCounter lap={replay.lap} totalLaps={replay.totalLaps} />
        <RaceClock ms={replay.elapsedMs} direction="up" label="ELAPSED" />
        {/*
         * Gone at the finish rather than disabled: the column is the result then, with its points,
         * and a control that can no longer do anything still asks the eye to read it.
         */}
        {!replay.finished && <ValueModePicker value={valueMode} onSelect={onValueMode} />}
      </div>

      {podium && <Podium steps={podium} size="sm" />}

      <TimingTower
        rows={replay.rows}
        drivers={drivers}
        teams={teams}
        mode={replay.finished ? 'results' : valueMode}
        maxRows={replay.rows.length}
        showTyre={false}
        overtakeMode={overtakeModeFor(race.season)}
        followedId={followedId ?? null}
        onRowClick={handleRowClick}
        renderExpanded={renderExpanded}
        className="w-full"
      />
      {/*
       * Above the notes rather than under them: the notes are the column's footnotes, and a card
       * of race figures reads as part of the timing, not as something after the small print.
       */}
      {timed && trapDriver && (
        <SpeedTrapCard
          code={trapDriver.code}
          color={teams[trapDriver.teamId]?.color}
          speed={trapSpeed}
          bestCode={trapBest?.code}
          bestSpeed={trapBest?.speedKph ?? null}
        />
      )}
      <p className="text-xs text-muted-foreground">Click a row to follow a driver. Esc releases.</p>
      {!replay.finished && (
        <p className="text-xs text-muted-foreground">
          Order and gaps between laps are interpolated from lap times.
        </p>
      )}
    </div>
  );
}

function Circuit({
  race,
  replay,
  circuit,
  followedId,
  onFollow,
}: {
  race: ReplayRace;
  replay: RaceReplay;
  circuit: ReplayCircuit;
  followedId: string | undefined;
  onFollow: (driverId: string) => void;
}) {
  // Following a driver overrides the emphasis the timing gives the car furthest along.
  const markers = useMemo(
    () => (followedId === undefined ? replay.markers : emphasiseMarker(replay.markers, followedId)),
    [replay.markers, followedId],
  );
  const handleMarkerClick = useCallback((marker: TrackMarker) => onFollow(marker.id), [onFollow]);

  /**
   * The flag flying over the track, over the map it belongs to. At the finish it is the chequered
   * one, which is the only flag this page showed before race control was in the dataset.
   */
  const status = replay.finished ? 'chequered' : trackStatusAt(race, replay.elapsedMs);
  const flagged = useMemo(() => flaggedSectorsAt(race, replay.elapsedMs), [race, replay.elapsedMs]);

  return (
    <figure className="flex flex-col gap-3 border border-border bg-card p-5">
      {/*
       * A green track is no news, and a green bar sitting there for two hours would be noise the
       * viewer learns to ignore — so the banner is only on screen when something is flying. Its
       * text changes when the flag does and not on the clock's ticks, so the live region announces
       * a change of flag rather than ten times a second.
       */}
      <FlagBanner status={status} visible={status !== 'green'} />
      <TrackMap
        // A new outline restarts the markers, so their lap counters do not carry over.
        key={circuit.name}
        path={circuit.d}
        pitLane={circuit.pit.d}
        viewBox={circuit.viewBox}
        markers={markers}
        sectors={flagged}
        // After a seek the cars snap to the new time; sliding there would cross the circuit.
        transitionMs={replay.jumped ? 0 : REPLAY_MARKER_TRANSITION_MS}
        onMarkerClick={handleMarkerClick}
        dimOthers={followedId !== undefined}
      />
      <figcaption className="text-xs text-muted-foreground">
        {circuit.real
          ? `${circuit.name}, unofficial layout from public GeoJSON, approximate pit lane. `
          : `${circuit.name}, an invented circuit. `}
        Positions are interpolated from lap times; they are not real telemetry. A flagged stretch of
        track is drawn in the right place only roughly: race control counts marshalling posts, and
        that count need not begin at the start line or run the way the cars do, so a zone can sit
        turned from where the flags really were.
      </figcaption>
    </figure>
  );
}

/**
 * One car's strategy. Memoised on what it draws: the panel re-renders ten times a second, and a
 * bar only changes when its car completes a lap.
 */
const StrategyLine = memo(function StrategyLine({
  driverId,
  code,
  color,
  stints,
  totalLaps,
  lap,
  followed,
  onFollow,
}: {
  driverId: string;
  code: string;
  color: string;
  stints: readonly ReplayStint[];
  totalLaps: number;
  lap: number;
  followed: boolean;
  onFollow: (driverId: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-slot="strategy-line"
        data-driver={driverId}
        aria-pressed={followed}
        onClick={() => onFollow(driverId)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          followed && 'bg-primary/10',
        )}
      >
        <span className="w-9 shrink-0 font-mono text-[11px] font-bold uppercase tracking-wider">
          {code}
        </span>
        <span aria-hidden className="h-3.5 w-[3px] shrink-0" style={{ backgroundColor: color }} />
        <StintBar
          size="sm"
          stints={stints}
          totalLaps={totalLaps}
          currentLap={lap}
          className="min-w-0 flex-1"
        />
      </button>
    </li>
  );
});

/**
 * The same accordion movement as the tower's expanded row: the panel's own height is what grows,
 * the content fades a step faster, and closing is quicker than opening.
 */
const PANEL_MOTION = {
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

/**
 * One thing race control said. Memoised on what it draws, like `StrategyLine`: the panel re-renders
 * ten times a second and a message never changes once it has been issued.
 *
 * The text is quoted exactly as race control wrote it, capitals and all. It is a fact about the
 * event, the same stance the page takes on driver names, and rewording a stewards' decision would
 * make it something this site said instead.
 */
const RaceControlLine = memo(function RaceControlLine({
  lap,
  code,
  message,
}: {
  lap: number | null;
  code: string | undefined;
  message: string;
}) {
  return (
    <li
      data-slot="race-control-line"
      className="flex gap-3 border-b border-border/60 py-1.5 last:border-b-0"
    >
      <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {lap === null ? EMPTY : `L${lap}`}
      </span>
      {/* The column keeps its width with no car named, so every message starts on one line. */}
      <span className="w-9 shrink-0 font-mono text-[11px] font-bold uppercase tracking-wider">
        {code ?? ''}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-relaxed">{message}</span>
    </li>
  );
});

/** Nothing to show yet: one array, so the feed's memo is not woken by a fresh empty one. */
const NO_MESSAGES: ReplayRaceControl[] = [];

type StrategyTab = 'strategy' | 'gaps' | 'laps' | 'control';

/** Radix hands back a string; anything the panel does not know falls back to the first tab. */
function asStrategyTab(value: string): StrategyTab {
  return value === 'gaps' || value === 'laps' || value === 'control' ? value : 'strategy';
}

/**
 * The whole field's tyre strategy under the map, in the tower's order, closed until asked for:
 * it is the second question a viewer has, after who is where.
 *
 * Open state and the tab live here rather than in the URL. They are how the page is being read,
 * not what it is showing, so a shared link should not carry them.
 */
function StrategyPanel({
  race,
  replay,
  stints,
  pit,
  followedId,
  onFollow,
}: {
  race: ReplayRace;
  replay: RaceReplay;
  stints: StintsByDriver;
  pit: PitLaneShape | undefined;
  followedId: string | undefined;
  onFollow: (driverId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<StrategyTab>('strategy');
  // Here rather than in the grid, which Radix unmounts with its tab: coming back keeps the measure.
  const [measure, setMeasure] = useState<LapGridMeasure>('lap');

  const drivers = useMemo(() => new Map(race.drivers.map((d) => [d.id, d])), [race]);
  const teams = useMemo(() => new Map(race.teams.map((team) => [team.id, team])), [race]);
  // Nothing is measured while the panel is closed: this runs on every tick when it is open.
  const cars = useMemo(
    () => (open && tab === 'strategy' ? carLapsAt(race, replay.elapsedMs, pit) : undefined),
    [open, tab, race, replay.elapsedMs, pit],
  );

  /**
   * One line per car, in the grid's own order rather than the running order, so the series the
   * memoised chart is handed only changes when the race does.
   */
  const gapSeries = useMemo<GapChartSeries[]>(() => {
    const gaps = replayGaps(race);
    return race.drivers.map((driver) => ({
      id: driver.id,
      code: driver.code,
      color: teams.get(driver.teamId)?.color,
      gaps: gaps.get(driver.id) ?? [],
    }));
  }, [race, teams]);

  // The chart may only show laps the leader has finished, so it never gives the result away.
  const gapLaps = useMemo(
    () => (open && tab === 'gaps' ? leaderLapsCompleted(race, replay.elapsedMs) : 0),
    [open, tab, race, replay.elapsedMs],
  );

  /**
   * The feed grows as the race runs, so it is only read while it is the tab on screen. The list
   * itself is cheap — a slice of an array the helper indexed once — and each line is memoised, so
   * a tick that adds no message re-renders nothing below this component.
   */
  const control = useMemo(
    () => (open && tab === 'control' ? raceControlUpTo(race, replay.elapsedMs) : NO_MESSAGES),
    [open, tab, race, replay.elapsedMs],
  );
  const hasControl = race.raceControl.length > 0;

  return (
    <section data-slot="strategy-panel" className="border border-border bg-card">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-5 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <span className="font-display text-sm font-bold uppercase tracking-widest">Strategy</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" className="overflow-hidden" {...PANEL_MOTION}>
            <div className="px-5 pb-4">
              <Tabs value={tab} onValueChange={(value) => setTab(asStrategyTab(value))}>
                <TabsList>
                  <TabsTrigger value="strategy">Strategy</TabsTrigger>
                  <TabsTrigger value="gaps">Gaps</TabsTrigger>
                  {/* Before Race control, which comes and goes with the race: this one never moves. */}
                  <TabsTrigger value="laps">Laps</TabsTrigger>
                  {/* Nothing to list for a race the source has no messages for. */}
                  {hasControl && <TabsTrigger value="control">Race control</TabsTrigger>}
                </TabsList>
                <TabsContent value="strategy">
                  <ul aria-label="Strategy" className="flex list-none flex-col">
                    {replay.rows.map((row) => {
                      const driver = drivers.get(row.driverId);
                      if (!driver) return null;
                      const own = stints.get(row.driverId) ?? [];
                      return (
                        <StrategyLine
                          key={row.driverId}
                          driverId={row.driverId}
                          code={driver.code}
                          color={teams.get(driver.teamId)?.color ?? 'currentColor'}
                          stints={own}
                          totalLaps={race.totalLaps}
                          // A car out of the race keeps the race it ran.
                          lap={cars?.get(row.driverId)?.lap ?? own.at(-1)?.toLap ?? 0}
                          followed={row.driverId === followedId}
                          onFollow={onFollow}
                        />
                      );
                    })}
                  </ul>
                </TabsContent>
                <TabsContent value="gaps">
                  {/* The fallback holds the chart's height, so the panel does not jump when it lands. */}
                  <Suspense fallback={<div aria-busy="true" className="h-64 md:h-80" />}>
                    <GapChart
                      series={gapSeries}
                      totalLaps={race.totalLaps}
                      currentLap={gapLaps}
                      emphasisedId={followedId}
                      onSeriesClick={onFollow}
                      className="h-64 md:h-80"
                    />
                  </Suspense>
                  <p className="pt-2 text-xs text-muted-foreground">
                    Gaps are the dataset's own, measured at the line. Click a line to follow that
                    driver.
                  </p>
                </TabsContent>
                <TabsContent value="laps">
                  <LapGrid
                    race={race}
                    rows={replay.rows}
                    elapsedMs={replay.elapsedMs}
                    finished={replay.finished}
                    measure={measure}
                    onMeasure={setMeasure}
                    followedId={followedId}
                    onFollow={onFollow}
                  />
                </TabsContent>
                {hasControl && (
                  <TabsContent value="control">
                    {/*
                     * The list only grows, so it is bounded and scrolls inside itself: a race can
                     * send close to two hundred messages, and the panel is under the map.
                     */}
                    <ul
                      aria-label="Race control"
                      className="flex max-h-72 list-none flex-col overflow-y-auto"
                    >
                      {control.map((message, position) => (
                        <RaceControlLine
                          // Two messages can share a moment, so the place in the feed is part of
                          // the identity; the feed only ever grows from the top.
                          key={`${message.atMs}:${control.length - position}`}
                          lap={message.lap}
                          code={
                            message.driverId === null
                              ? undefined
                              : drivers.get(message.driverId)?.code
                          }
                          message={message.message}
                        />
                      ))}
                    </ul>
                    <p className="pt-2 text-xs text-muted-foreground">
                      {control.length === 0
                        ? 'Race control has said nothing yet.'
                        : "Race control's own messages, newest first, quoted as they were issued."}
                    </p>
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ReplayPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const index = useReplayIndex();
  const races = useMemo(() => byDateDescending(index.data?.races ?? []), [index.data]);

  // An unknown season/round falls back to the newest race rather than showing an error: the
  // curated list changes, and a stale bookmark should still play something.
  const requested =
    search.season === undefined || search.round === undefined
      ? undefined
      : `${search.season}-${search.round}`;
  const entry = races.find((race) => race.id === requested) ?? races[0];

  const race = useReplayRace(entry?.id);
  const circuit = useMemo(
    () => (race.data ? circuitForRace(race.data.circuit) : undefined),
    [race.data],
  );
  const replay = useRaceReplay(race.data, { pit: circuit?.pit });

  const stints = useMemo(
    () => (race.data ? stintsByDriver(race.data) : new Map<string, ReplayStint[]>()),
    [race.data],
  );
  const followedId = race.data ? followedDriverId(race.data, search.driver) : undefined;
  const valueMode: TowerValueMode = search.value ?? 'leader';

  /**
   * Which column the tower shows is a view of the race like the followed driver, so it replaces
   * the URL rather than stacking history entries. The default is stripped from the search instead
   * of written into it, so a link only carries a `value` when it is not the one everyone starts on.
   */
  const setValueMode = useCallback(
    (mode: TowerValueMode) => {
      void navigate({
        search: ({ value: _value, ...rest }) =>
          mode === 'leader' ? rest : { ...rest, value: mode },
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const release = useCallback(() => {
    void navigate({
      search: ({ driver: _driver, ...rest }) => rest,
      replace: true,
      // The router has `scrollRestoration`, and a navigation resets the scroll unless told
      // otherwise. Following is a change of view inside the page, not a page change: the
      // tower has to stay where the viewer clicked it.
      resetScroll: false,
    });
  }, [navigate]);

  /**
   * Following is a view of the race, not a step in it, so it replaces the URL rather than
   * stacking history entries. Clicking the followed car again lets it go.
   */
  const follow = useCallback(
    (driverId: string) => {
      if (driverId === followedId) {
        release();
        return;
      }
      const code = race.data?.drivers.find((driver) => driver.id === driverId)?.code;
      if (code === undefined) return;
      void navigate({
        search: (prev) => ({ ...prev, driver: code }),
        replace: true,
        resetScroll: false,
      });
    },
    [followedId, navigate, race.data, release],
  );

  // Escape belongs to whatever the viewer is typing in or dragging, if anything.
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('input, textarea, select, [role="slider"], [contenteditable="true"]')
    ) {
      return;
    }
    release();
  });

  // Subscribed once for as long as a driver is followed: the handler above reads the current
  // `release` on its own, so switching driver does not tear the listener down and back up.
  const following = followedId !== undefined;
  useEffect(() => {
    if (!following) return;
    const onKeyDown = (event: KeyboardEvent) => onEscape(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [following]);

  return (
    <div className="space-y-8 py-4">
      <header className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Replay</p>
          <p className="text-xs text-muted-foreground">The whole library in one race</p>
        </div>
        <div>
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight md:text-5xl">
            {entry ? entry.name : 'Race replay'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {entry
              ? `${entry.circuit} · ${formatRaceDate(entry.date)}`
              : 'Pick a race to play back.'}
          </p>
        </div>
        <RacePicker
          races={races}
          value={entry?.id}
          // A whole new search, so another race starts with no followed driver: that driver
          // belongs to the race it was picked in. The column mode is a preference about the
          // tower and means the same thing in every race, so it rides along.
          onSelect={(next) =>
            void navigate({
              search: { season: next.season, round: next.round, value: search.value },
            })
          }
        />
        <p className="max-w-3xl border-l-2 border-border pl-4 text-xs leading-relaxed text-muted-foreground">
          Race data from{' '}
          <a
            href={JOLPICA_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            jolpica-f1
          </a>
          , a community API. Driver and team names are facts about the event; this site is
          unofficial and not affiliated with any series, team or circuit. Team colours are
          approximations chosen by this project.
        </p>
      </header>

      {index.status === 'error' && (
        <Message onRetry={index.reload}>{`The race list did not load (${index.error}).`}</Message>
      )}
      {index.status === 'ready' && races.length === 0 && (
        <Message>No races have been generated yet. Run the replay build script.</Message>
      )}
      {race.status === 'error' && (
        <Message onRetry={race.reload}>{`This race did not load (${race.error}).`}</Message>
      )}
      {(index.status === 'loading' || index.status === 'idle' || race.status === 'loading') && (
        <Message>Loading the race…</Message>
      )}

      <Controls replay={replay} disabled={race.data === undefined} />

      {race.data && circuit && (
        // The page has the whole width now, so the tower column grows with it while the map,
        // which is the point of the page, still takes everything left over.
        <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <Stage
            race={race.data}
            replay={replay}
            stints={stints}
            pit={circuit.pit}
            followedId={followedId}
            onFollow={follow}
            valueMode={valueMode}
            onValueMode={setValueMode}
          />
          <div className="flex min-w-0 flex-col gap-6">
            <Circuit
              race={race.data}
              replay={replay}
              circuit={circuit}
              followedId={followedId}
              onFollow={follow}
            />
            <StrategyPanel
              race={race.data}
              replay={replay}
              stints={stints}
              pit={circuit.pit}
              followedId={followedId}
              onFollow={follow}
            />
          </div>
        </div>
      )}
    </div>
  );
}
