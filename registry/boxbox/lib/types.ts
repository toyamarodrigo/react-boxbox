export const TYRE_COMPOUNDS = ['S', 'M', 'H', 'I', 'W'] as const;

export type TyreCompound = (typeof TYRE_COMPOUNDS)[number];
export type SectorStatus = 'fastest' | 'personal' | 'slower' | 'unset';
export type TrackStatus = 'green' | 'yellow' | 'red' | 'sc' | 'vsc' | 'chequered';
export type GapMode = 'leader' | 'interval' | 'lapTime';

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
  tyre: { compound: TyreCompound; age: number };
  inPit: boolean;
  lapped: boolean;
  drs: boolean;
  positionChange: number;
};
