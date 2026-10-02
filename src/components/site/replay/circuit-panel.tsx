import { useCallback, useId, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import type { ReplayCircuit } from '@/data/circuit-for-race';
import { ELEVATION_CREDIT } from '@/data/elevation-sources';
import { battleCardAt } from '@/data/replay-battle';
import { pitStopCardAt } from '@/data/replay-pit-stop';
import type { ReplayRace } from '@/data/replay-schema';
import { emphasiseMarker, flaggedSectorsAt, trackStatusAt } from '@/data/replay-timing';
import { REPLAY_MARKER_TRANSITION_MS, type RaceReplay } from '@/data/use-race-replay';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TrackMarker } from '@/registry/boxbox/lib/types';
import { BattleCard } from '@/registry/boxbox/ui/battle-card';
import { FlagBanner } from '@/registry/boxbox/ui/flag-banner';
import { PitStopCard } from '@/registry/boxbox/ui/pit-stop-card';
import { TrackMap } from '@/registry/boxbox/ui/track-map';
import { type OnboardCamera, OnboardView } from './onboard-view';

/**
 * The tallest each card gets: an overtake tag, both tyres, a position out. Drawn invisible under
 * the real card, so a slot holds its height from the start and never measures anything.
 */
const BATTLE_CARD_SIZER = (
  <BattleCard
    position={20}
    ahead={{ code: 'WWW' }}
    // Two codes, not one: the card keys its rows by code.
    behind={{ code: 'MMM' }}
    interval={88.888}
    trend={-8.8}
    overtake
    size="sm"
  />
);
const PIT_STOP_CARD_SIZER = (
  <PitStopCard
    code="WWW"
    stop={8}
    laneTime={88.8}
    compoundOff="M"
    compoundOn="H"
    positionIn={20}
    positionOut={20}
    size="sm"
  />
);

/** What the Track Map panel shows: the 2D map, or the Onboard view in its place. */
export type TrackView = 'map' | 'onboard';

const TRACK_VIEWS: readonly { value: TrackView; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'onboard', label: 'Onboard' },
];

/** One place in the strip under the map: the sizer and the card share one grid cell. */
function CardSlot({
  sizer,
  className,
  children,
}: {
  sizer: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid', className)}>
      {/* Still: a sizer that animated would join the page's layout animations for nothing. */}
      <div aria-hidden inert className="invisible [grid-area:1/1]">
        <MotionConfig reducedMotion="always">{sizer}</MotionConfig>
      </div>
      <div data-card="live" className="[grid-area:1/1]">
        <AnimatePresence>{children}</AnimatePresence>
      </div>
    </div>
  );
}

/**
 * The Map/Onboard toggle. With the Onboard view blocked its button stays focusable, described by
 * the reason, so the reason is read out with it rather than the button vanishing.
 */
function TrackViewToggle({
  view,
  onView,
  blocked,
}: {
  view: TrackView;
  onView: (view: TrackView) => void;
  blocked: string | undefined;
}) {
  const reasonId = useId();
  return (
    <div className="flex items-center gap-2 self-end">
      {blocked && (
        <p id={reasonId} data-slot="onboard-blocked" className="text-xs text-muted-foreground">
          {blocked}
        </p>
      )}
      <fieldset aria-label="Track view" className="flex gap-1">
        {TRACK_VIEWS.map(({ value, label }) => {
          const off = value === 'onboard' && blocked !== undefined;
          return (
            <Button
              key={value}
              size="xs"
              variant={view === value ? 'default' : 'outline'}
              aria-pressed={view === value}
              aria-disabled={off || undefined}
              aria-describedby={off ? reasonId : undefined}
              className={off ? 'cursor-not-allowed opacity-50' : undefined}
              onClick={off ? undefined : () => onView(value)}
            >
              {label}
            </Button>
          );
        })}
      </fieldset>
    </div>
  );
}

/**
 * The Track Map panel of the Replay page: the flag flying over the track, the map with every car
 * at race time, and the battle and pit stop cards under it.
 */
export function CircuitPanel({
  race,
  replay,
  circuit,
  followedId,
  comparedIds,
  onFollow,
  view,
  onView,
  camera,
  onCamera,
  onboardBlocked,
}: {
  race: ReplayRace;
  replay: RaceReplay;
  circuit: ReplayCircuit;
  followedId: string | undefined;
  comparedIds: readonly string[];
  onFollow: (driverId: string) => void;
  /** The view and the camera live in the URL, so a Moment link carries them. */
  view: TrackView;
  onView: (view: TrackView) => void;
  camera: OnboardCamera;
  onCamera: (camera: OnboardCamera) => void;
  /** Why this browser gets the Track Map only (see `onboardBlocker`), if it does. */
  onboardBlocked: string | undefined;
}) {
  // Neither WebGPU nor WebGL2 drew the scene: the map comes back, and the URL with it, so a
  // moment link copied now opens the view the viewer has.
  const [failure, setFailure] = useState<string>();
  const handleFailure = useCallback(() => {
    setFailure('3D could not start');
    onView('map');
  }, [onView]);
  const blocked = onboardBlocked ?? failure;
  const shown: TrackView = blocked ? 'map' : view;

  // Following a driver overrides the emphasis the timing gives the car furthest along; the
  // compared drivers take the lesser one, so they stay in view while the rest of the field fades.
  const markers = useMemo(
    () =>
      followedId === undefined
        ? replay.markers
        : emphasiseMarker(replay.markers, followedId, comparedIds),
    [replay.markers, followedId, comparedIds],
  );
  const handleMarkerClick = useCallback((marker: TrackMarker) => onFollow(marker.id), [onFollow]);

  /**
   * The flag flying over the track, over the map it belongs to. At the finish it is the chequered
   * one, which is the only flag this page showed before race control was in the dataset.
   */
  const status = replay.finished ? 'chequered' : trackStatusAt(race, replay.elapsedMs);
  const flagged = useMemo(() => flaggedSectorsAt(race, replay.elapsedMs), [race, replay.elapsedMs]);

  // The followed car's stop, from the lane entry to a moment after the exit; nobody else's.
  const stopCard =
    followedId === undefined
      ? null
      : pitStopCardAt(
          race,
          followedId,
          replay.elapsedMs,
          replay.pitStops,
          circuit.pit,
          circuit.profile,
        );
  const stopDriver = stopCard
    ? race.drivers.find((driver) => driver.id === stopCard.driverId)
    : undefined;

  // The followed driver's battle, or the one highest up the order; none once the flag is out.
  const battle = replay.finished
    ? null
    : battleCardAt(race, replay.elapsedMs, followedId, {
        rows: replay.rows,
        pit: circuit.pit,
        profile: circuit.profile,
      });
  const battleCar = (driverId: string) => {
    const driver = race.drivers.find((entry) => entry.id === driverId);
    return driver
      ? { code: driver.code, color: race.teams.find((team) => team.id === driver.teamId)?.color }
      : undefined;
  };
  const battleAhead = battle ? battleCar(battle.aheadId) : undefined;
  const battleBehind = battle ? battleCar(battle.behindId) : undefined;

  // The same map either way; as the Onboard view's minimap it draws its cars smaller.
  const trackMap = (size: 'sm' | 'md') => (
    <TrackMap
      size={size}
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
  );

  return (
    <figure className="flex flex-col gap-3 border border-border bg-card p-5">
      {/*
       * A green track is no news, and a green bar sitting there for two hours would be noise the
       * viewer learns to ignore — so the banner is only on screen when something is flying. Its
       * text changes when the flag does and not on the clock's ticks, so the live region announces
       * a change of flag rather than ten times a second.
       */}
      <FlagBanner status={status} visible={status !== 'green'} />
      <TrackViewToggle view={shown} onView={onView} blocked={blocked} />
      {shown === 'onboard' ? (
        <OnboardView
          race={race}
          replay={replay}
          circuit={circuit}
          followedId={followedId}
          comparedIds={comparedIds}
          minimap={trackMap('sm')}
          camera={camera}
          onCamera={onCamera}
          onFailure={handleFailure}
        />
      ) : (
        trackMap('md')
      )}
      {/*
       * Under the map rather than over it, so no graphic covers a stretch of track. Both places
       * keep the height of their tallest card, so the page never moves as a card comes and goes.
       */}
      <div className="grid gap-3 sm:grid-cols-2">
        <CardSlot sizer={BATTLE_CARD_SIZER}>
          {battle && battleAhead && battleBehind && (
            <BattleCard
              key={battle.key}
              position={battle.position}
              ahead={battleAhead}
              behind={battleBehind}
              interval={battle.interval}
              trend={battle.trend}
              overtake={battle.overtake}
              size="sm"
            />
          )}
        </CardSlot>
        <CardSlot sizer={PIT_STOP_CARD_SIZER} className="sm:justify-items-end">
          {stopCard && stopDriver && (
            <PitStopCard
              key={stopCard.key}
              code={stopDriver.code}
              color={race.teams.find((team) => team.id === stopDriver.teamId)?.color}
              stop={stopCard.stop}
              laneTime={stopCard.laneTime}
              compoundOff={stopCard.compoundOff}
              compoundOn={stopCard.compoundOn}
              positionIn={stopCard.positionIn}
              positionOut={stopCard.positionOut}
              size="sm"
            />
          )}
        </CardSlot>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {circuit.real
          ? `${circuit.name}, unofficial layout from public GeoJSON, approximate pit lane. `
          : `${circuit.name}, an invented circuit. `}
        Positions are interpolated from lap times; they are not real telemetry. A flagged stretch of
        track is drawn in the right place only roughly: race control counts marshalling posts, and
        that count need not begin at the start line or run the way the cars do, so a zone can sit
        turned from where the flags really were.
        {shown === 'onboard' && circuit.elevationSource && (
          <> {ELEVATION_CREDIT[circuit.elevationSource]}</>
        )}
      </figcaption>
    </figure>
  );
}
