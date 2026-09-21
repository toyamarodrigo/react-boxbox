import type {
  SectorTime,
  TimingRow,
  TrackStatus,
  TyreCompound,
} from '../../registry/boxbox/lib/types';
import type { Grid } from './schema';

export type Rng = () => number;
export type RaceState = {
  lap: number;
  totalLaps: number;
  /** Race time since lights out, so a clock and a lap counter can share one source. */
  elapsedMs: number;
  trackStatus: TrackStatus;
  rows: TimingRow[];
  sessionBest: { sectors: [number | null, number | null, number | null]; lap: number | null };
  personalBestSectors: Record<string, [number | null, number | null, number | null]>;
};

export function createSeededRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const compounds: TyreCompound[] = ['S', 'M', 'H', 'I', 'W'];

// Wear runs ahead of age: a set is roughly three percent used per lap, and each
// driver burns it at their own rate.
const initialWear = (age: number, rng: Rng) => Math.min(100, round(age * 3 + rng() * 10));
const nextWear = (wear: number, rng: Rng) => Math.min(100, round(wear + 1.5 + rng() * 2));

export function createInitialRace(grid: Grid, rng: Rng): RaceState {
  const rows = grid.drivers.map((driver, index): TimingRow => {
    const gap = index === 0 ? 0 : round(index * 1.8 + rng() * 0.5);
    const compound = compounds[Math.floor(rng() * 3)]!;
    const age = Math.floor(rng() * 8);
    return {
      driverId: driver.id,
      position: index + 1,
      gapToLeader: gap,
      interval: index === 0 ? null : round(gap - (index - 1) * 1.8),
      lastLapTime: null,
      bestLapTime: null,
      sectors: Array.from({ length: 3 }, (): SectorTime => ({ time: null, status: 'unset' })) as [
        SectorTime,
        SectorTime,
        SectorTime,
      ],
      tyre: { compound, age, wear: initialWear(age, rng) },
      inPit: false,
      lapped: false,
      drs: false,
      positionChange: 0,
    };
  });
  for (let index = 1; index < rows.length; index++) {
    rows[index]!.interval = round(rows[index]!.gapToLeader! - rows[index - 1]!.gapToLeader!);
  }
  return {
    lap: 0,
    totalLaps: 70,
    elapsedMs: 0,
    trackStatus: 'green',
    rows,
    sessionBest: { sectors: [null, null, null], lap: null },
    personalBestSectors: {},
  };
}

export function advanceRace(state: RaceState, rng: Rng): RaceState {
  if (state.lap >= state.totalLaps) return state;
  const sessionSectors = [...state.sessionBest.sectors] as [
    number | null,
    number | null,
    number | null,
  ];
  const personalBestSectors = { ...state.personalBestSectors };
  let sessionLap = state.sessionBest.lap;
  const previousPositions = new Map(state.rows.map((row) => [row.driverId, row.position]));
  const rows = state.rows.map((row) => {
    const inPit = rng() < 0.025;
    // Worn tyres cost time, so a fresh set after a stop is what wins places back.
    const pace = 85 + rng() * 10 + row.tyre.age * 0.06 + (inPit ? 20 : 0);
    const previousBest = personalBestSectors[row.driverId] ?? [null, null, null];
    const personal = [...previousBest] as [number | null, number | null, number | null];
    const sectors = [0, 1, 2].map((index): SectorTime => {
      const time = round(pace / 3 + (rng() - 0.5) * 1.5);
      const sessionBest = sessionSectors[index];
      const personalBest = personal[index];
      if (sessionBest == null || time < sessionBest) sessionSectors[index] = time;
      if (personalBest == null || time < personalBest) personal[index] = time;
      return { time, status: 'unset' };
    }) as [SectorTime, SectorTime, SectorTime];
    personalBestSectors[row.driverId] = personal;
    const lapTime = round(sectors.reduce((sum, sector) => sum + sector.time!, 0));
    if (sessionLap === null || lapTime < sessionLap) sessionLap = lapTime;
    const tyre: TimingRow['tyre'] = inPit
      ? {
          compound:
            compounds[
              (compounds.indexOf(row.tyre.compound) +
                1 +
                Math.floor(rng() * (compounds.length - 1))) %
                compounds.length
            ]!,
          age: 0,
          wear: 0,
        }
      : { ...row.tyre, age: row.tyre.age + 1, wear: nextWear(row.tyre.wear ?? 0, rng) };
    return {
      ...row,
      sectors,
      tyre,
      inPit,
      lastLapTime: lapTime,
      bestLapTime: row.bestLapTime === null ? lapTime : Math.min(row.bestLapTime, lapTime),
    };
  });

  for (const row of rows) {
    const previous = state.personalBestSectors[row.driverId] ?? [null, null, null];
    row.sectors = row.sectors.map((sector, index): SectorTime => ({
      ...sector,
      status:
        sector.time === sessionSectors[index]
          ? 'fastest'
          : previous[index] == null || sector.time! < previous[index]!
            ? 'personal'
            : 'slower',
    })) as [SectorTime, SectorTime, SectorTime];
  }

  // The order falls out of the gaps rather than a swap of neighbours: each driver
  // runs their own race, so a stop costs real track position and drops them past
  // however many cars fit in those seconds, and fresh tyres climb back over the
  // laps that follow. Adjacent swaps could only ever move a driver one place.
  const leaderLap = rows[0]!.lastLapTime!;
  const projected = rows
    .map((row) => ({
      row,
      gap: Math.max(
        0,
        (row.gapToLeader ?? 0) + (row.lastLapTime! - leaderLap) * 0.15 + (row.inPit ? 8 : 0),
      ),
    }))
    .sort((a, b) => a.gap - b.gap);

  const leaderGap = projected[0]!.gap;
  let previousGap = 0;
  const ranked = projected.map(({ row, gap }, index) => {
    // Keep the field ordered and never let two cars share a gap.
    const gapToLeader = index === 0 ? 0 : round(Math.max(previousGap + 0.2, gap - leaderGap));
    previousGap = gapToLeader;
    return {
      ...row,
      position: index + 1,
      positionChange: previousPositions.get(row.driverId)! - (index + 1),
      gapToLeader,
      interval: index === 0 ? null : 0,
      lapped: gapToLeader > leaderLap,
      drs: false,
    };
  });
  for (let index = 1; index < ranked.length; index++) {
    const current = ranked[index]!;
    current.interval = round(current.gapToLeader! - ranked[index - 1]!.gapToLeader!);
    // DRS depends on the car directly ahead, not on the cumulative gap to the leader.
    current.drs = current.interval < 1 && !current.inPit;
  }
  const roll = rng();
  const trackStatus: TrackStatus =
    state.lap + 1 === state.totalLaps
      ? 'chequered'
      : roll < 0.015
        ? 'yellow'
        : roll < 0.02
          ? 'vsc'
          : // A double yellow is rarer than a single one, so it comes last.
            roll < 0.025
            ? 'double-yellow'
            : 'green';
  // The clock follows the leader: one tick is one of their laps. Without a lap time
  // to go on, a plausible one keeps the clock moving and stays seeded.
  const lapMs =
    ranked[0]?.lastLapTime != null
      ? Math.round(ranked[0].lastLapTime * 1000)
      : Math.round(90_000 + (rng() - 0.5) * 6000);
  return {
    lap: state.lap + 1,
    totalLaps: state.totalLaps,
    elapsedMs: state.elapsedMs + lapMs,
    trackStatus,
    rows: ranked,
    sessionBest: { sectors: sessionSectors, lap: sessionLap },
    personalBestSectors,
  };
}
