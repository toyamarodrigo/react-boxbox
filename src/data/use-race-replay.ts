import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TimingRow, TrackMarker } from '@/registry/boxbox/lib/types';
import type { ReplayRace } from './replay-schema';
import type { SpeedProfile } from './speed-profile';
import {
  type NeutralisationPeriod,
  type PitLaneShape,
  type ReplayPitStop,
  leaderCumulative,
  neutralisationPeriods,
  replayLiveRows,
  replayPitStops,
  replayProgress,
  replayResultsRows,
} from './replay-timing';

/** How fast the replay runs against the real race time. */
export type ReplaySpeed = 1 | 5 | 20;
export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [1, 5, 20];

/** The clock ticks on a fixed grid; the speed changes how much time each tick buys. */
/** Wall-clock interval between replay ticks; the Track Map chains its marker transitions to it. */
export const REPLAY_TICK_MS = 100;
const TICK_MS = REPLAY_TICK_MS;

/**
 * How long a Track Map marker takes to reach each new sample: half a tick longer than the tick.
 * A tick that lands late — the tower reordering on an overtake is enough — would otherwise find
 * every car already arrived and stopped, and at 5× or 20× that stop-and-jump is plain to see.
 * Each new sample retargets the marker from where it is, so the cars run half a tick behind the
 * clock instead, at a steady speed.
 */
export const REPLAY_MARKER_TRANSITION_MS = REPLAY_TICK_MS * 1.5;

/**
 * How often the tower's gaps and intervals refresh, in race time. The order updates every tick;
 * the numbers once a second, the way a timing screen refreshes at each timing loop rather than
 * running like a stopwatch.
 */
export const GAP_REFRESH_MS = 1000;

/** No race to read: the same empty array every render, so a memoised consumer is not woken. */
const NO_NEUTRALISATIONS: readonly NeutralisationPeriod[] = [];

export type RaceReplay = {
  /** The lap in progress, which is what a lap board shows. */
  lap: number;
  totalLaps: number;
  elapsedMs: number;
  /** The leader's race time at the flag: the end of the clock. */
  endMs: number;
  /** The leader's race time at the end of each lap, index 0 being the start. */
  lapBoundaries: readonly number[];
  /**
   * True when the clock last moved by a seek rather than a tick. A map animating between
   * samples should snap on that render instead of sliding its cars across the circuit.
   */
  jumped: boolean;
  rows: TimingRow[];
  markers: TrackMarker[];
  /** When each drawable pit stop begins, on the race clock, in time order. */
  pitStops: readonly ReplayPitStop[];
  /** The stretches run under a safety car, a virtual safety car or a red flag, in time order. */
  neutralisations: readonly NeutralisationPeriod[];
  finished: boolean;
  isPlaying: boolean;
  speed: ReplaySpeed;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  /** Moves the clock to a race time, clamped to the race. */
  seek: (ms: number) => void;
  setLap: (lap: number) => void;
  nextLap: () => void;
  previousLap: () => void;
};

/**
 * Plays a curated race back from its lap times.
 *
 * The clock is the leader's race time: `elapsedMs` runs forward, and the lap boundaries are the
 * leader's cumulative times. That keeps the replay honest — a lap changes when the leader
 * crosses the line, not on a timer of its own — and it makes seeking exact, because jumping to
 * a lap is just moving the clock to that boundary.
 *
 * The tower runs live between the recorded laps: order by interpolated race distance every tick,
 * gaps and intervals interpolated and refreshed once per race second, position changes measured
 * against the order at the leader's last line crossing. The lap board shows the lap in progress.
 */
export function useRaceReplay(
  race: ReplayRace | undefined,
  {
    speed: initialSpeed = 1,
    autoPlay = false,
    pit,
    profile,
  }: {
    speed?: ReplaySpeed;
    autoPlay?: boolean;
    /** The circuit's pit lane, so stops are drawn on it and `IN PIT` covers the stop itself. */
    pit?: PitLaneShape;
    /** The circuit's speed profile, so the tower and the Track Map place cars the same way. */
    profile?: SpeedProfile;
  } = {},
): RaceReplay {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [jumped, setJumped] = useState(false);
  const [wantsPlay, setWantsPlay] = useState(autoPlay);
  const [speed, setSpeed] = useState<ReplaySpeed>(initialSpeed);

  // Loading another race rewinds the clock. Resetting during render rather than in an effect
  // means the first paint after the swap already shows lap one, never the old race's last lap.
  const [shown, setShown] = useState(race);
  if (shown !== race) {
    setShown(race);
    setElapsedMs(0);
    setJumped(true);
    setWantsPlay(autoPlay);
  }

  const totalLaps = race?.totalLaps ?? 0;

  /** Lap boundaries, index 0 being the start. Recomputed once per race, not once per tick. */
  const boundaries = useMemo(() => {
    if (!race) return [0];
    return Array.from({ length: totalLaps + 1 }, (_, lap) => leaderCumulative(race, lap));
  }, [race, totalLaps]);

  const endMs = boundaries[totalLaps] ?? 0;
  const finished = race !== undefined && totalLaps > 0 && elapsedMs >= endMs;
  const isPlaying = race !== undefined && wantsPlay && !finished;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setElapsedMs((current) => Math.min(current + TICK_MS * speed, endMs));
      setJumped(false);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [endMs, isPlaying, speed]);

  /** The highest lap the leader has finished. Zero before the first lap is complete. */
  let completedLap = 0;
  for (let lap = 1; lap <= totalLaps; lap++) {
    if ((boundaries[lap] ?? Number.POSITIVE_INFINITY) > elapsedMs) break;
    completedLap = lap;
  }
  const lapInProgress = Math.min(completedLap + 1, Math.max(totalLaps, 1));
  // Position arrows compare with the leader's last line crossing; none during the first lap,
  // where the only earlier order would be the grid, which the dataset does not carry.
  const referenceMs = completedLap >= 1 ? boundaries[completedLap] : undefined;

  const rows = useMemo(() => {
    if (!race) return [];
    if (finished) return replayResultsRows(race);
    return replayLiveRows(race, elapsedMs, {
      gapAtMs: Math.floor(elapsedMs / GAP_REFRESH_MS) * GAP_REFRESH_MS,
      referenceMs,
      pit,
      profile,
    });
  }, [race, finished, elapsedMs, referenceMs, pit, profile]);

  const markers = useMemo(() => {
    if (!race || finished) return [];
    return replayProgress(race, elapsedMs, pit, profile);
  }, [race, finished, elapsedMs, pit, profile]);

  const pitStops = useMemo(() => (race && pit ? replayPitStops(race, pit) : []), [race, pit]);

  /** Derived from the race alone, like the stops: the helper caches them per race object. */
  const neutralisations = useMemo(
    () => (race ? neutralisationPeriods(race) : NO_NEUTRALISATIONS),
    [race],
  );

  const seek = useCallback(
    (ms: number) => {
      if (!race) return;
      setElapsedMs(Math.min(Math.max(0, ms), endMs));
      setJumped(true);
    },
    [endMs, race],
  );

  const setLap = useCallback(
    (lap: number) => {
      const target = Math.min(Math.max(1, Math.round(lap)), Math.max(1, totalLaps));
      seek(boundaries[target - 1] ?? 0);
    },
    [boundaries, seek, totalLaps],
  );

  const restart = useCallback(() => {
    setElapsedMs(0);
    setJumped(true);
    setWantsPlay(autoPlay);
  }, [autoPlay]);

  return {
    lap: lapInProgress,
    totalLaps,
    elapsedMs,
    endMs,
    lapBoundaries: boundaries,
    jumped,
    rows,
    markers,
    pitStops,
    neutralisations,
    finished,
    isPlaying,
    speed,
    play: useCallback(() => setWantsPlay(true), []),
    pause: useCallback(() => setWantsPlay(false), []),
    restart,
    setSpeed,
    seek,
    setLap,
    nextLap: useCallback(() => setLap(lapInProgress + 1), [setLap, lapInProgress]),
    previousLap: useCallback(() => setLap(lapInProgress - 1), [setLap, lapInProgress]),
  };
}
