import { describe, expect, it } from 'vitest';
import { testReplayRace } from './replay-fixtures';
import { PIT_STOP_CARD_HOLD_MS, pitStopCardAt } from './replay-pit-stop';
import type { ReplayRace } from './replay-schema';
import { type PitLaneShape, replayPitStops } from './replay-timing';

/** The invented circuit's pit lane: in at 96% of the lap, out at 6% of the next. */
const pit: PitLaneShape = { entry: 0.96, exit: 0.06 };

/**
 * Charlie stops at the end of lap one, 20 s in the lane, from mediums to softs. The line sits
 * 40% of the way down the lane, so the car enters 8 s before its 160 s lap ends: in at 152 s,
 * out at 172 s.
 */
function pittedRace(changes: Partial<{ pitStop: number | null }> = {}): ReplayRace {
  const race = testReplayRace();
  return {
    ...race,
    laps: race.laps.map((lap) =>
      lap.lap === 1
        ? {
            ...lap,
            rows: lap.rows.map((row) =>
              row.driverId === 'charlie'
                ? { ...row, inPit: true, pitDurationMs: 20_000, pitStop: 1, ...changes }
                : row,
            ),
          }
        : lap,
    ),
    stints: race.stints.map((car) =>
      car.driverId === 'charlie'
        ? {
            driverId: 'charlie',
            stints: [
              { fromLap: 1, toLap: 1, compound: 'M' },
              { fromLap: 2, toLap: 3, compound: 'S' },
            ],
          }
        : car,
    ),
  };
}

const cardAt = (race: ReplayRace, elapsedMs: number, driverId = 'charlie') =>
  pitStopCardAt(race, driverId, elapsedMs, replayPitStops(race, pit), pit);

describe('pitStopCardAt', () => {
  it('shows nothing before the car enters the lane', () => {
    expect(cardAt(pittedRace(), 151_999)).toBeNull();
  });

  it('counts the lane time up during the pit window, with no position out yet', () => {
    expect(cardAt(pittedRace(), 155_000)).toEqual({
      key: 'charlie-1',
      driverId: 'charlie',
      stop: 1,
      laneTime: 3,
      compoundOff: 'M',
      compoundOn: 'S',
      positionIn: 3,
      positionOut: undefined,
    });
  });

  it('settles on the lane time at the exit and adds the position out', () => {
    const card = cardAt(pittedRace(), 172_000);
    expect(card?.laneTime).toBe(20);
    expect(card?.positionOut).toBe(3);
    // Held, not followed: the figures stay those of the exit.
    expect(cardAt(pittedRace(), 179_000)).toEqual(card);
  });

  it('stays for eight seconds of race time after the exit, then goes', () => {
    expect(PIT_STOP_CARD_HOLD_MS).toBe(8000);
    expect(cardAt(pittedRace(), 172_000 + PIT_STOP_CARD_HOLD_MS - 1)).not.toBeNull();
    expect(cardAt(pittedRace(), 172_000 + PIT_STOP_CARD_HOLD_MS)).toBeNull();
  });

  it('is only ever the car asked for', () => {
    expect(cardAt(pittedRace(), 155_000, 'alpha')).toBeNull();
  });

  it('leaves both compounds out when either is unknown', () => {
    const race = pittedRace();
    const unknown = {
      ...race,
      stints: race.stints.map((car) =>
        car.driverId === 'charlie'
          ? {
              ...car,
              stints: car.stints.map((stint) =>
                stint.fromLap === 2 ? { ...stint, compound: null } : stint,
              ),
            }
          : car,
      ),
    };
    const card = cardAt(unknown, 155_000);
    expect(card?.compoundOff).toBeUndefined();
    expect(card?.compoundOn).toBeUndefined();
    expect(cardAt({ ...race, stints: [] }, 155_000)?.compoundOff).toBeUndefined();
  });

  it('counts a stop the dataset does not number', () => {
    expect(cardAt(pittedRace({ pitStop: null }), 155_000)?.stop).toBe(1);
  });
});
