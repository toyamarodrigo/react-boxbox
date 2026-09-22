import { memo, useCallback, useEffect, useEffectEvent, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { z } from 'zod';
import type { ReplayIndexEntry, ReplayRace } from '../data/replay-schema';
import type { RaceReplay, ReplaySpeed } from '../data/use-race-replay';
import { REPLAY_SPEEDS, REPLAY_TICK_MS, useRaceReplay } from '../data/use-race-replay';
import {
  type ReplayPitStop,
  emphasiseMarker,
  followedDriverId,
  formatRaceTime,
  overtakeModeFor,
  positionsSinceStart,
  replayPodium,
} from '../data/replay-timing';
import { byDateDescending, formatRaceDate } from '../data/replay-index';
import { useReplayIndex, useReplayRace } from '../data/use-replay-data';
import { type ReplayCircuit, circuitForRace } from '../data/circuit-for-race';
import type { TimingRow, TrackMarker } from '@/registry/boxbox/lib/types';
import { FlagBanner } from '@/registry/boxbox/ui/flag-banner';
import { LapCounter } from '@/registry/boxbox/ui/lap-counter';
import { Podium } from '@/registry/boxbox/ui/podium';
import { RaceClock } from '@/registry/boxbox/ui/race-clock';
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

/**
 * What the followed row shows on this page: the tower's own figures plus the places the car has
 * made up since the grid, which the registry cannot know. No tyre line: the dataset has none.
 */
function FollowedFigures({
  race,
  row,
  ahead,
  behind,
}: {
  race: ReplayRace;
  row: TimingRow;
  ahead: TimingRow | undefined;
  behind: TimingRow | undefined;
}) {
  const made = positionsSinceStart(race, row.driverId, row.position);
  const change = positionChangeState(made ?? 0);

  return (
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
  );
}

function Stage({
  race,
  replay,
  followedId,
  onFollow,
}: {
  race: ReplayRace;
  replay: RaceReplay;
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

  // Both are handed to the tower on every tick, so neither may be a fresh value each render.
  const handleRowClick = useCallback((row: TimingRow) => onFollow(row.driverId), [onFollow]);
  const renderExpanded = useCallback(
    (row: TimingRow, ctx: TimingTowerExpandedContext) => (
      <FollowedFigures race={race} row={row} ahead={ctx.ahead} behind={ctx.behind} />
    ),
    [race],
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
          <Stage race={race.data} replay={replay} followedId={followedId} onFollow={follow} />
          <Circuit replay={replay} circuit={circuit} followedId={followedId} onFollow={follow} />
        </div>
      )}
    </div>
  );
}
