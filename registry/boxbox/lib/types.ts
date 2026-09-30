export const TYRE_COMPOUNDS = ['S', 'M', 'H', 'I', 'W'] as const;

export type TyreCompound = (typeof TYRE_COMPOUNDS)[number];
export type SectorStatus = 'fastest' | 'personal' | 'slower' | 'unset';
export type TrackStatus = 'green' | 'yellow' | 'red' | 'sc' | 'vsc' | 'chequered' | 'double-yellow';
/** What the timing tower's value column measures. `leader` is the gap to the leader. */
export type ValueMode = 'leader' | 'interval' | 'lapTime' | 'results';
/** How a car ended the race. Anything other than `finished` is unclassified. */
export type FinishStatus = 'finished' | 'dnf' | 'dsq' | 'dns';

/** A slice of a lap, measured as progress from 0 to 1 along the track path. */
export type TrackSector = { start: number; end: number; status?: TrackStatus };
/** A car on the track map. `progress` is 0 to 1 along the lap, from the start/finish line. */
export type TrackMarker = {
  id: string;
  /** 0..1 around the lap; along the pit lane from entry to exit while `inPit`. */
  progress: number;
  color: string;
  code?: string;
  emphasis?: boolean;
  /** The car is in the pit lane; needs the map's `pitLane` path to show. */
  inPit?: boolean;
};

export type Team = { id: string; name: string; color: string };
export type Driver = {
  id: string;
  code: string;
  number: number;
  firstName: string;
  lastName: string;
  teamId: string;
};
export type SectorTime = { time: number | null; status: SectorStatus };
export type TimingRow = {
  driverId: string;
  position: number;
  gapToLeader: number | null;
  interval: number | null;
  lastLapTime: number | null;
  bestLapTime: number | null;
  sectors: [SectorTime, SectorTime, SectorTime];
  tyre: { compound: TyreCompound; age: number; wear?: number };
  inPit: boolean;
  lapped: boolean;
  drs: boolean;
  positionChange: number;
  /** Laps behind the leader, for a lapped car in a results listing. Defaults to one. */
  lapsBehind?: number;
  /** Championship points scored, shown in the results listing only. */
  points?: number;
  /**
   * How the car ended the race. Absent means it finished. While the race is still running, a
   * value other than `finished` lists the car as `OUT`: faded, muted, without tags.
   */
  finishStatus?: FinishStatus;
  /**
   * Places the car is ahead of where it started the race: its grid slot minus its position.
   * Positive is a gain, negative a loss. Absent when there is nothing to count from. The tower
   * shows it on every row in `results` mode and in the default expanded row; a car that is not
   * classified shows none.
   */
  positionsGained?: number;
  /**
   * The car started from the pit lane. It counts as the last grid slot for `positionsGained`,
   * and the tower marks the figure `PL`. Read only alongside `positionsGained`.
   */
  pitLaneStart?: boolean;
};
