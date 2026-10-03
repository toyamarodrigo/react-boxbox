import { describe, expect, it } from 'vitest';
import { battleCardAt, replayBattles } from './replay-battle';
import { testReplayRace } from './replay-fixtures';
import type { ReplayRace, ReplayRaceControl } from './replay-schema';
import type { PitLaneShape } from './replay-timing';

/** The invented circuit's pit lane: in at 96% of the lap, out at 6% of the next. */
const pit: PitLaneShape = { entry: 0.96, exit: 0.06 };

/** The clock every fixture car runs against: one lap every 90 s. */
const LAP_MS = 90_000;

/** When a car crossed the line at the end of `lap`, `behind` ms after the 90 s clock. */
const lineAt = (lap: number, behind: number) => LAP_MS * lap + behind;

/**
 * A race from each car's time behind the 90 s clock at every line, so the interval between two
 * cars is the difference of their figures: `{ lead: [0, 0], chase: [800, 700] }` is a chaser
 * 0.8 s and then 0.7 s behind. The order at each line follows from the times, so a negative
 * difference is a pass. `pits` lists the laps a car stops at the end of, 20 s in the lane.
 */
function raceOf(
  behind: Record<string, readonly number[]>,
  {
    pits = {},
    raceControl = [],
  }: { pits?: Record<string, readonly number[]>; raceControl?: ReplayRaceControl[] } = {},
): ReplayRace {
  const base = testReplayRace();
  const ids = Object.keys(behind);
  const totalLaps = Math.max(...ids.map((id) => behind[id]!.length));

  const laps = Array.from({ length: totalLaps }, (_, i) => {
    const lap = i + 1;
    const crossings = ids
      .filter((id) => behind[id]![i] !== undefined)
      .map((id) => ({ id, at: lineAt(lap, behind[id]![i]!) }))
      .sort((a, b) => a.at - b.at);
    return {
      lap,
      rows: crossings.map(({ id, at }, index) => {
        const start = i === 0 ? 0 : lineAt(lap - 1, behind[id]![i - 1]!);
        const stops = pits[id] ?? [];
        return {
          driverId: id,
          position: index + 1,
          lapTimeMs: at - start,
          cumulativeMs: at,
          gapToLeaderMs: at - crossings[0]!.at,
          intervalMs: index === 0 ? null : at - crossings[index - 1]!.at,
          inPit: stops.includes(lap),
          pitDurationMs: stops.includes(lap) ? 20_000 : null,
          pitStop: stops.includes(lap) ? stops.indexOf(lap) + 1 : null,
          stationaryMs: null,
          overtake: false,
          lapsBehind: 0,
          sectorMs: [null, null, null] as [null, null, null],
          speedTrapKph: null,
        };
      }),
    };
  });

  return {
    ...base,
    totalLaps,
    drivers: ids.map((id, index) => ({
      id,
      code: id.slice(0, 3).toUpperCase(),
      number: index + 1,
      firstName: id,
      lastName: id,
      teamId: 'red',
    })),
    laps,
    results: ids.map((id, index) => ({
      driverId: id,
      position: index + 1,
      positionText: String(index + 1),
      grid: index + 1,
      points: 0,
      laps: behind[id]!.length,
      status: 'Finished',
      finishStatus: 'finished',
      timeMs: null,
      gapToWinnerMs: null,
      lapsBehind: 0,
    })),
    stints: [],
    raceControl,
  };
}

/** Two cars with the chaser's interval to the leader at each line, in ms. */
const duel = (intervals: readonly number[], options?: Parameters<typeof raceOf>[1]) =>
  raceOf({ lead: intervals.map(() => 0), chase: intervals }, options);

/** A safety car from `fromMs` until the message that brings it in, at `toMs`. */
const safetyCar = (fromMs: number, toMs: number): ReplayRaceControl[] => [
  {
    atMs: fromMs,
    lap: null,
    flag: null,
    category: 'SafetyCar',
    scope: null,
    sector: null,
    driverId: null,
    message: 'SAFETY CAR DEPLOYED',
  },
  {
    atMs: toMs,
    lap: null,
    flag: null,
    category: 'SafetyCar',
    scope: null,
    sector: null,
    driverId: null,
    message: 'SAFETY CAR IN THIS LAP',
  },
];

describe('replayBattles', () => {
  it('starts a battle at the second lap in a row within 1.0 s', () => {
    const [battle, ...rest] = replayBattles(duel([3000, 900, 800, 700]));
    expect(rest).toEqual([]);
    expect(battle).toMatchObject({
      ids: ['lead', 'chase'],
      fromLap: 3,
      fromMs: lineAt(3, 800),
      end: 'finish',
      toMs: lineAt(4, 700),
    });
  });

  it('does not start on one lap within 1.0 s', () => {
    expect(replayBattles(duel([3000, 900, 1200, 3000]))).toEqual([]);
    expect(replayBattles(duel([900, 3000, 900, 3000]))).toEqual([]);
  });

  it('keeps a battle between 1.0 and 1.5 s and ends it past 1.5 s', () => {
    const race = duel([900, 800, 1400, 1500, 1600, 900]);
    const [battle, ...rest] = replayBattles(race);
    expect(rest).toEqual([]);
    expect(battle).toMatchObject({ fromLap: 2, end: 'gap', toMs: lineAt(5, 1600) });
    // Still on at 1.4 and 1.5 s: the way out is wider than the way in.
    expect(battleCardAt(race, lineAt(4, 1500) + 1000, undefined)).not.toBeNull();
    expect(battleCardAt(race, lineAt(5, 1600) + 1000, undefined)).toBeNull();
  });

  it('needs two new laps within 1.0 s after a battle has ended', () => {
    const battles = replayBattles(duel([900, 800, 1600, 900, 800, 800]));
    expect(battles.map((battle) => battle.fromLap)).toEqual([2, 5]);
  });

  it('does not start under a neutralisation, and counts two clean laps after it', () => {
    // The safety car is out from lap 2 to lap 3, so laps 2 and 3 are not clean.
    const race = duel([3000, 500, 500, 500, 500, 500], {
      raceControl: safetyCar(100_000, 250_000),
    });
    const [battle, ...rest] = replayBattles(race);
    expect(rest).toEqual([]);
    expect(battle?.fromLap).toBe(5);
  });

  it('ends a battle when a neutralisation begins, not at the next line', () => {
    const race = duel([500, 500, 500, 500, 500, 500, 500], {
      raceControl: safetyCar(200_000, 350_000),
    });
    const [first, second, ...rest] = replayBattles(race);
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ fromLap: 2, end: 'neutralisation', toMs: 200_000 });
    expect(battleCardAt(race, 199_000, undefined)).not.toBeNull();
    expect(battleCardAt(race, 200_000, undefined)).toBeNull();
    // Laps 3 and 4 touched the safety car; 5 and 6 are the two clean ones.
    expect(second?.fromLap).toBe(6);
  });

  it('keeps the battle through an overtake, with the cars swapped', () => {
    const race = duel([800, 700, -500, -600, -700]);
    const [battle, ...rest] = replayBattles(race);
    expect(rest).toEqual([]);
    expect(battle?.lines.at(-1)).toMatchObject({ lap: 5, aheadId: 'chase', behindId: 'lead' });
    expect(battle?.end).toBe('finish');
  });

  it('ends a battle when either car stops', () => {
    const race = duel([800, 700, 600, 500, 400], { pits: { lead: [4] } });
    const [battle, ...rest] = replayBattles(race, pit);
    expect(rest).toEqual([]);
    // The car ahead enters the lane 8 s before its line at the end of lap 4.
    expect(battle).toMatchObject({ fromLap: 2, end: 'pit', toMs: lineAt(4, 0) - 8000 });
    // Without a pit lane shape the stop is only known at the line.
    expect(
      replayBattles(duel([800, 700, 600, 500, 400], { pits: { chase: [4] } }))[0],
    ).toMatchObject({ end: 'pit', toMs: lineAt(4, 500) });
  });

  it('ends a battle when the two are no longer one place apart', () => {
    // A third car arrives between them at the line of lap 3.
    const race = raceOf({
      lead: [0, 0, 0, 0],
      split: [5000, 3000, 300, 300],
      chase: [800, 700, 600, 600],
    });
    const battle = replayBattles(race).find((entry) => entry.ids.includes('lead'));
    expect(battle).toMatchObject({ ids: ['lead', 'chase'], end: 'apart', toMs: lineAt(3, 0) });
  });
});

describe('battleCardAt', () => {
  it('shows the interval, the trend over the last three laps, and no tag', () => {
    const race = duel([1000, 900, 800, 700, 600, 600]);
    const card = battleCardAt(race, lineAt(5, 600), undefined, { pit });
    expect(card).toMatchObject({
      position: 1,
      aheadId: 'lead',
      behindId: 'chase',
      overtake: false,
    });
    // 0.9 s after lap 2, 0.6 s after lap 5: three laps, 0.1 s a lap closer.
    expect(card?.trend).toBeCloseTo(-0.1);
    expect(card?.interval).toBeCloseTo(0.6);
  });

  it('tags the lap after the swap OVERTAKE, with the car that passed ahead', () => {
    const race = duel([800, 700, -500, -600, -700]);
    const after = battleCardAt(race, lineAt(3, 0) + 1000, undefined);
    expect(after).toMatchObject({ aheadId: 'chase', behindId: 'lead', overtake: true });
    // One sample in the new order is no trend.
    expect(after?.trend).toBeNull();
    const lapLater = battleCardAt(race, lineAt(4, 0) + 1000, undefined);
    expect(lapLater).toMatchObject({ aheadId: 'chase', overtake: false });
    expect(lapLater?.trend).toBeCloseTo(0.1);
  });

  it('shows nothing when no battle is on', () => {
    expect(battleCardAt(duel([3000, 3000, 3000]), lineAt(2, 0), undefined)).toBeNull();
  });

  describe('which battle', () => {
    // A train of three at the front, a separate battle for fourth, and a car on its own.
    const race = raceOf({
      alpha: [0, 0, 0, 0],
      bravo: [700, 700, 700, 700],
      charlie: [1400, 1400, 1400, 1400],
      delta: [20_000, 20_000, 20_000, 20_000],
      echo: [20_600, 20_600, 20_600, 20_600],
      foxtrot: [60_000, 60_000, 60_000, 60_000],
    });
    const at = lineAt(3, 0) + 30_000;
    const pair = (followedId?: string) => {
      const card = battleCardAt(race, at, followedId);
      return card && [card.aheadId, card.behindId];
    };

    it("shows the followed driver's battle", () => {
      expect(pair('echo')).toEqual(['delta', 'echo']);
      expect(pair('alpha')).toEqual(['alpha', 'bravo']);
      expect(pair('charlie')).toEqual(['bravo', 'charlie']);
    });

    it('in a train, shows the battle with the car ahead of the followed driver', () => {
      expect(pair('bravo')).toEqual(['alpha', 'bravo']);
    });

    it('otherwise shows the battle highest up the order', () => {
      expect(pair(undefined)).toEqual(['alpha', 'bravo']);
      expect(pair('foxtrot')).toEqual(['alpha', 'bravo']);
    });
  });
});
