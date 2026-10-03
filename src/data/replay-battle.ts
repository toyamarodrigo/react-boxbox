import type { TimingRow } from '@/registry/boxbox/lib/types';
import type { ReplayLapRow, ReplayRace } from './replay-schema';
import type { SpeedProfile } from './speed-profile';
import {
  type PitLaneShape,
  neutralisationPeriods,
  replayLiveRows,
  replayPitStops,
} from './replay-timing';

/** A battle starts once the interval at the line is this or less, on two laps in a row. */
export const BATTLE_START_MS = 1000;
/** Laps in a row the interval has to stay within `BATTLE_START_MS` for a battle to start. */
export const BATTLE_START_LAPS = 2;
/** A battle ends at the first line the interval is more than this: 1.0 s in, 1.5 s out. */
export const BATTLE_END_MS = 1500;
/** Laps the trend is measured over, so four line crossings when the pair has them. */
export const BATTLE_TREND_LAPS = 3;

/** One line crossing of the car behind, with the car one place ahead of it. */
export type BattleLine = {
  lap: number;
  /** When the car behind crossed the line, on the race clock. */
  atMs: number;
  aheadId: string;
  behindId: string;
  /** The car ahead's position at the line. */
  position: number;
  intervalMs: number;
};

/** Why a battle ended. `finish` is the car behind taking the flag with the battle still on. */
export type BattleEnd = 'gap' | 'neutralisation' | 'pit' | 'apart' | 'finish';

/** One battle over the race, from the line that started it to the moment it ended. */
export type ReplayBattle = {
  /** One per battle, so a new battle between the same two cars remounts the card. */
  key: string;
  /** The two cars, in the order the battle started with: the car ahead first. */
  ids: [string, string];
  /** The line crossing that started it: the second lap in a row within `BATTLE_START_MS`. */
  fromMs: number;
  /** The moment it ended: a line, the start of a neutralisation, or a pit entry. */
  toMs: number;
  fromLap: number;
  end: BattleEnd;
  /**
   * The pair's clean line crossings, in lap order: up to `BATTLE_TREND_LAPS` before the one that
   * started the battle, so the trend has laps to go on from the start, then every one inside it.
   */
  lines: BattleLine[];
};

/** What the Battle Card shows for one battle at one moment of the race. */
export type ReplayBattleCard = {
  key: string;
  /** The place the two are fighting over: the car ahead's position. */
  position: number;
  aheadId: string;
  behindId: string;
  /** Seconds between the two, as the tower shows it; the last line's figure when it cannot. */
  interval: number | null;
  /** The interval's change per lap in seconds, from the line; `null` when there is none to take. */
  trend: number | null;
  /** The two swapped at the car behind's last line crossing. */
  overtake: boolean;
};

type Sample = BattleLine & {
  /** Either car stopped at the end of this lap, so the crossing was made in the pit lane. */
  pit: string | null;
  /** When the car behind began the lap, for the neutralisation test. */
  startMs: number;
};

/** An unordered pair of cars, so a pass does not make a new pair. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The adjacent pairs at one lap's line: each car with the car one place ahead of it. */
function samplesOf(lap: number, rows: readonly ReplayLapRow[]): Map<string, Sample | null> {
  const order = [...rows].sort((a, b) => a.position - b.position);
  const samples = new Map<string, Sample | null>();
  for (let i = 1; i < order.length; i += 1) {
    const ahead = order[i - 1]!;
    const behind = order[i]!;
    if (behind.position !== ahead.position + 1) continue;
    const key = pairKey(ahead.driverId, behind.driverId);
    // A pair the dataset has no crossing or interval for is next to each other but unmeasured.
    if (behind.cumulativeMs === null || behind.intervalMs === null) {
      samples.set(key, null);
      continue;
    }
    samples.set(key, {
      lap,
      atMs: behind.cumulativeMs,
      aheadId: ahead.driverId,
      behindId: behind.driverId,
      position: ahead.position,
      intervalMs: behind.intervalMs,
      pit: ahead.inPit ? ahead.driverId : behind.inPit ? behind.driverId : null,
      startMs: behind.cumulativeMs - (behind.lapTimeMs ?? 0),
    });
  }
  return samples;
}

const BATTLES = new WeakMap<
  ReplayRace,
  { pit: PitLaneShape | undefined; battles: ReplayBattle[] }
>();

const samePit = (a: PitLaneShape | undefined, b: PitLaneShape | undefined) =>
  a === b || (a !== undefined && b !== undefined && a.entry === b.entry && a.exit === b.exit);

/**
 * Every battle of the race, in the order they started.
 *
 * Each pair of cars one place apart at a line runs its own state machine on the car behind's
 * line crossings. Two clean laps in a row within `BATTLE_START_MS` start a battle at the second
 * crossing; a clean crossing past `BATTLE_END_MS` ends it there, and anything between the two
 * keeps it going. A pass keeps it too: the pair is the same two cars, now the other way round.
 *
 * A lap is not clean when it touched a neutralisation (any part of the car behind's lap under a
 * safety car, a virtual safety car or a red flag) or when either car stopped at its end, since
 * that crossing is made in the pit lane. A battle never runs through one: it ends when the
 * neutralisation begins or the car enters the lane (with a `pit` shape; without one, at the line),
 * and a new one needs two clean laps again. A battle also ends at the first line the two are not
 * one place apart, and at the flag.
 *
 * Built once per race object and pit shape, like the indexes it reads.
 */
export function replayBattles(race: ReplayRace, pit?: PitLaneShape): readonly ReplayBattle[] {
  const cached = BATTLES.get(race);
  if (cached && samePit(cached.pit, pit)) return cached.battles;

  const periods = neutralisationPeriods(race);
  const stops = pit ? replayPitStops(race, pit) : [];
  const battles: ReplayBattle[] = [];
  /** Each pair's clean crossings on consecutive laps, the last few only. */
  const runs = new Map<string, BattleLine[]>();
  const open = new Map<string, ReplayBattle>();

  const close = (key: string, battle: ReplayBattle, toMs: number, end: BattleEnd) => {
    const last = battle.lines.at(-1)?.atMs ?? battle.fromMs;
    battle.toMs = Math.max(toMs, last);
    battle.end = end;
    open.delete(key);
    if (battle.toMs > battle.fromMs) battles.push(battle);
  };

  for (const { lap, rows } of race.laps) {
    const samples = samplesOf(lap, rows);
    const crossings = new Map(rows.map((row) => [row.driverId, row.cumulativeMs]));

    for (const [key, battle] of open) {
      if (samples.get(key)) continue;
      // Split by a third car: gone as the first of the two reaches the line that shows it. A car
      // with no crossing at all has retired, and left the map at its last one.
      const a = crossings.get(battle.ids[0]) ?? null;
      const b = crossings.get(battle.ids[1]) ?? null;
      const last = battle.lines.at(-1)?.atMs ?? battle.fromMs;
      close(key, battle, a === null || b === null ? last : Math.min(a, b), 'apart');
    }

    for (const [key, sample] of samples) {
      if (sample === null) {
        runs.delete(key);
        continue;
      }
      const { pit: pitter, startMs, ...line } = sample;
      const neutralised = periods.find(
        (period) => period.fromMs < line.atMs && period.toMs > startMs,
      );
      const battle = open.get(key);

      if (pitter !== null || neutralised) {
        runs.delete(key);
        if (!battle) continue;
        if (neutralised) close(key, battle, neutralised.fromMs, 'neutralisation');
        else {
          const stop = stops.find((entry) => entry.driverId === pitter && entry.lap === lap);
          close(key, battle, stop?.atMs ?? line.atMs, 'pit');
        }
        continue;
      }

      const previous = runs.get(key) ?? [];
      const run = previous.at(-1)?.lap === lap - 1 ? [...previous, line] : [line];
      runs.set(key, run.slice(-(BATTLE_TREND_LAPS + 1)));

      if (battle) {
        if (line.intervalMs > BATTLE_END_MS) close(key, battle, line.atMs, 'gap');
        else battle.lines.push(line);
        continue;
      }

      const recent = run.slice(-BATTLE_START_LAPS);
      if (
        recent.length === BATTLE_START_LAPS &&
        recent.every((entry) => entry.intervalMs <= BATTLE_START_MS)
      ) {
        open.set(key, {
          key: `${key}-${lap}`,
          ids: [line.aheadId, line.behindId],
          fromMs: line.atMs,
          toMs: Number.POSITIVE_INFINITY,
          fromLap: lap,
          end: 'finish',
          lines: run.slice(-(BATTLE_TREND_LAPS + 1)),
        });
      }
    }
  }

  for (const [key, battle] of open) {
    close(key, battle, battle.lines.at(-1)?.atMs ?? battle.fromMs, 'finish');
  }

  battles.sort((a, b) => a.fromMs - b.fromMs);
  BATTLES.set(race, { pit, battles });
  return battles;
}

/** The interval's change per lap over the last laps the pair ran in the same order, in seconds. */
function trendOf(lines: readonly BattleLine[]): number | null {
  const last = lines.at(-1);
  if (!last) return null;
  let first = lines.length - 1;
  while (
    first > 0 &&
    lines.length - first <= BATTLE_TREND_LAPS &&
    lines[first - 1]!.aheadId === last.aheadId
  ) {
    first -= 1;
  }
  const from = lines[first]!;
  if (from.lap === last.lap) return null;
  return (last.intervalMs - from.intervalMs) / (last.lap - from.lap) / 1000;
}

/** One battle as the card shows it at `elapsedMs`: live order and interval, line trend and tag. */
function cardOf(
  battle: ReplayBattle,
  elapsedMs: number,
  rows: ReadonlyMap<string, TimingRow>,
): ReplayBattleCard | null {
  const upTo = battle.lines.filter((line) => line.atMs <= elapsedMs);
  const line = upTo.at(-1);
  if (!line) return null;
  const previous = upTo.at(-2);

  // Live, as the tower orders them, while the two are next to each other there; the line if not.
  const [first, second] = [rows.get(line.aheadId), rows.get(line.behindId)];
  const live =
    first && second && Math.abs(first.position - second.position) === 1
      ? first.position < second.position
        ? { ahead: first, behind: second }
        : { ahead: second, behind: first }
      : null;
  const aheadId = live?.ahead.driverId ?? line.aheadId;
  // A pass the tower shows before the line confirms it has no trend yet in the new order.
  const asAtLine = aheadId === line.aheadId;

  return {
    key: battle.key,
    position: live?.ahead.position ?? line.position,
    aheadId,
    behindId: live?.behind.driverId ?? line.behindId,
    interval: live?.behind.interval ?? line.intervalMs / 1000,
    trend: asAtLine ? trendOf(upTo) : null,
    overtake:
      asAtLine &&
      line.atMs > battle.fromMs &&
      previous !== undefined &&
      previous.aheadId !== line.aheadId,
  };
}

/**
 * The battle the Battle Card shows at `elapsedMs`, or `null` when no battle is on.
 *
 * The followed driver's battle comes first; when it is in two, the one with the car ahead of it.
 * Without a followed driver, or when it is in none, the battle highest up the order. The cars and
 * the interval are the tower's, from `rows` (the live rows the page shows; built here when not
 * given), so the card never disagrees with the tower; the trend and the `OVERTAKE` tag come from
 * the line, where the battle itself is measured.
 */
export function battleCardAt(
  race: ReplayRace,
  elapsedMs: number,
  followedId: string | undefined,
  {
    rows,
    pit,
    profile,
  }: { rows?: readonly TimingRow[]; pit?: PitLaneShape; profile?: SpeedProfile } = {},
): ReplayBattleCard | null {
  const on = replayBattles(race, pit).filter(
    (battle) => battle.fromMs <= elapsedMs && elapsedMs < battle.toMs,
  );
  if (on.length === 0) return null;

  const live = new Map(
    (rows ?? replayLiveRows(race, elapsedMs, { pit, profile })).map((row) => [row.driverId, row]),
  );
  const cards = on.map((battle) => cardOf(battle, elapsedMs, live)).filter((card) => card !== null);

  const followed =
    followedId === undefined
      ? []
      : cards.filter((card) => card.aheadId === followedId || card.behindId === followedId);
  if (followed.length > 0) {
    return followed.find((card) => card.behindId === followedId) ?? followed[0]!;
  }
  return cards.reduce<ReplayBattleCard | null>(
    (best, card) => (best === null || card.position < best.position ? card : best),
    null,
  );
}
