import { memo, useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from 'cn';
import { z } from 'zod';
import type { ReplayIndexEntry, ReplayRace, ReplayStint } from '../data/replay-schema';
import type { RaceReplay, ReplaySpeed } from '../data/use-race-replay';
import { REPLAY_SPEEDS, REPLAY_TICK_MS, useRaceReplay } from '../data/use-race-replay';
import {
  type PitLaneShape,
  type ReplayPitStop,
  carLapsAt,
  emphasiseMarker,
  followedDriverId,
  formatRaceTime,
  leaderLapsCompleted,
  overtakeModeFor,
  positionsSinceStart,
  replayGaps,
  replayPodium,
  stintAt,
} from '../data/replay-timing';
import { byDateDescending, formatRaceDate } from '../data/replay-index';
import { useReplayIndex, useReplayRace } from '../data/use-replay-data';
import { type ReplayCircuit, circuitForRace } from '../data/circuit-for-race';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import type { TimingRow, TrackMarker } from '@/registry/boxbox/lib/types';
import { FlagBanner } from '@/registry/boxbox/ui/flag-banner';
import type { GapChartSeries } from '@/registry/boxbox/ui/gap-chart';
import { GapChart } from '@/registry/boxbox/ui/gap-chart';
import { LapCounter } from '@/registry/boxbox/ui/lap-counter';
import { Podium } from '@/registry/boxbox/ui/podium';
import { RaceClock } from '@/registry/boxbox/ui/race-clock';
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
import { Button } from '../components/ui/button';
import { Slider } from '../components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { seo } from '../lib/seo';

/**
 * A race is addressed by season and round, the way the source API addresses it, so a link to
 * `/replay?season=2025&round=1` keeps working when the curated list changes order.
 */
const searchSchema = z.object({
  season: z.coerce.number().int().min(1950).optional(),
  round: z.coerce.number().int().min(1).optional(),
  /** The followed driver, by the code the tower shows. An unknown one is ignored. */
  driver: z.string().optional(),
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
 * The race on one bar: drag anywhere in the race, with a tick at every lap boundary and the lap
 * in progress riding on the thumb. Seeking is live while dragging; the map snaps rather than
 * slides on those renders (see `RaceReplay.jumped`).
 */
function Timeline({ replay, disabled }: { replay: RaceReplay; disabled: boolean }) {
  const { endMs, lapBoundaries, pitStops, totalLaps } = replay;
  const percent = (ms: number) => (endMs > 0 ? (ms / endMs) * 100 : 0);

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
 * What the followed row shows on this page: the tower's own figures, the places the car has made
 * up since the grid, and its tyres — both of which the registry cannot know.
 *
 * Every line has a height of its own, because the tower's panel measures itself once as it opens
 * and anything that grew afterwards would hang out of it.
 */
function FollowedFigures({
  race,
  row,
  ahead,
  behind,
  stints,
  lap,
}: {
  race: ReplayRace;
  row: TimingRow;
  ahead: TimingRow | undefined;
  behind: TimingRow | undefined;
  stints: StintsByDriver;
  /** The lap this car is on, which is not the leader's lap. */
  lap: number;
}) {
  const made = positionsSinceStart(race, row.driverId, row.position);
  const change = positionChangeState(made ?? 0);
  const own = stints.get(row.driverId);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <TimingTowerFigure label="Last" figure="last">
          {formatLapTime(row.lastLapTime)}
        </TimingTowerFigure>
        <TimingTowerFigure label="Ahead" figure="ahead">
          {ahead === undefined ? EMPTY : formatGap(row.interval)}
        </TimingTowerFigure>
        <TimingTowerFigure label="Behind" figure="behind">
          {formatGap(behind?.interval ?? null)}
        </TimingTowerFigure>
        <TimingTowerFigure label="Since start" figure="places">
          {/* The arrow carries the direction, so the sentence below it carries the meaning. */}
          <span aria-hidden className={CHANGE_TONES[change]}>
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
      </div>
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

function Stage({
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
      />
    ),
    [race, stints, followedLap],
  );

  return (
    <div className="flex flex-col gap-4 border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <LapCounter lap={replay.lap} totalLaps={replay.totalLaps} />
        <RaceClock ms={replay.elapsedMs} direction="up" label="ELAPSED" />
      </div>

      <FlagBanner status="chequered" visible={replay.finished} />

      {podium && <Podium steps={podium} size="sm" />}

      <TimingTower
        rows={replay.rows}
        drivers={drivers}
        teams={teams}
        mode={replay.finished ? 'results' : 'leader'}
        maxRows={replay.rows.length}
        showTyre={false}
        overtakeMode={overtakeModeFor(race.season)}
        followedId={followedId ?? null}
        onRowClick={handleRowClick}
        renderExpanded={renderExpanded}
        className="w-full"
      />
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
  replay,
  circuit,
  followedId,
  onFollow,
}: {
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

  return (
    <figure className="border border-border bg-card p-5">
      <TrackMap
        // A new outline restarts the markers, so their lap counters do not carry over.
        key={circuit.name}
        path={circuit.d}
        pitLane={circuit.pit.d}
        viewBox={circuit.viewBox}
        markers={markers}
        // After a seek the cars snap to the new time; sliding there would cross the circuit.
        transitionMs={replay.jumped ? 0 : REPLAY_TICK_MS}
        onMarkerClick={handleMarkerClick}
        dimOthers={followedId !== undefined}
      />
      <figcaption className="mt-3 text-xs text-muted-foreground">
        {circuit.real
          ? `${circuit.name}, unofficial layout from public GeoJSON, approximate pit lane. `
          : `${circuit.name}, an invented circuit. `}
        Positions are interpolated from lap times; they are not real telemetry.
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

type StrategyTab = 'strategy' | 'gaps';

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
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value === 'gaps' ? 'gaps' : 'strategy')}
              >
                <TabsList>
                  <TabsTrigger value="strategy">Strategy</TabsTrigger>
                  <TabsTrigger value="gaps">Gaps</TabsTrigger>
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
                  <GapChart
                    series={gapSeries}
                    totalLaps={race.totalLaps}
                    currentLap={gapLaps}
                    emphasisedId={followedId}
                    onSeriesClick={onFollow}
                    className="h-64 md:h-80"
                  />
                  <p className="pt-2 text-xs text-muted-foreground">
                    Gaps are the dataset's own, measured at the line. Click a line to follow that
                    driver.
                  </p>
                </TabsContent>
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
          // A whole new search, so another race starts with no followed driver.
          onSelect={(next) => void navigate({ search: { season: next.season, round: next.round } })}
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
          />
          <div className="flex min-w-0 flex-col gap-6">
            <Circuit replay={replay} circuit={circuit} followedId={followedId} onFollow={follow} />
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
