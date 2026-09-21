import { describe, expect, it } from 'vitest';
import {
  deriveLaps,
  deriveResults,
  finishStatusOf,
  parseGap,
  parseLapTime,
  type RawLap,
  type RawPitStop,
  type RawResult,
} from './replay-derive';

/**
 * A four-lap, three-car mini race:
 * - `alpha` leads throughout on flat 1:30.000 laps.
 * - `bravo` runs second and retires after lap 2, so it drops out of the timings.
 * - `charlie` pits on lap 3, loses a lap doing it, then unlaps itself on lap 4.
 */
const rawLaps: RawLap[] = [
  {
    number: '1',
    Timings: [
      { driverId: 'alpha', position: '1', time: '1:30.000' },
      { driverId: 'bravo', position: '2', time: '1:30.500' },
      { driverId: 'charlie', position: '3', time: '1:32.000' },
    ],
  },
  {
    number: '2',
    Timings: [
      { driverId: 'alpha', position: '1', time: '1:30.000' },
      { driverId: 'bravo', position: '2', time: '1:30.200' },
      { driverId: 'charlie', position: '3', time: '1:32.000' },
    ],
  },
  {
    number: '3',
    Timings: [
      { driverId: 'alpha', position: '1', time: '1:30.000' },
      { driverId: 'charlie', position: '2', time: '3:05.000' },
    ],
  },
  {
    number: '4',
    Timings: [
      { driverId: 'alpha', position: '1', time: '1:30.000' },
      { driverId: 'charlie', position: '2', time: '1:20.000' },
    ],
  },
];

const rawPitStops: RawPitStop[] = [{ driverId: 'charlie', lap: '3', stop: '1', duration: '22.4' }];

const rawResults: RawResult[] = [
  {
    position: '1',
    positionText: '1',
    points: '25',
    laps: '4',
    status: 'Finished',
    Driver: { driverId: 'alpha' },
    Time: { millis: '360000', time: '6:00.000' },
  },
  {
    position: '2',
    positionText: '2',
    points: '18',
    laps: '4',
    status: '+1 Lap',
    Driver: { driverId: 'charlie' },
  },
  {
    position: '3',
    positionText: 'R',
    points: '0',
    laps: '2',
    status: 'Engine',
    Driver: { driverId: 'bravo' },
  },
];

const rowFor = (lap: number, driverId: string) => {
  const row = deriveLaps(rawLaps, rawPitStops)
    .find((entry) => entry.lap === lap)
    ?.rows.find((entry) => entry.driverId === driverId);
  if (!row) throw new Error(`No row for ${driverId} on lap ${lap}`);
  return row;
};

describe('parseLapTime', () => {
  it('reads minutes and seconds', () => expect(parseLapTime('1:31.512')).toBe(91512));
  it('reads bare seconds', () => expect(parseLapTime('31.512')).toBe(31512));
  it('reads hours', () => expect(parseLapTime('1:02:03.456')).toBe(3723456));
  it('reads a whole number of seconds', () => expect(parseLapTime('45')).toBe(45000));

  it.each(['', '  ', 'nope', '1:2:3:4.000', '+4.512', '1:31,512', '-1.000'])(
    'returns null for %o',
    (value) => expect(parseLapTime(value)).toBeNull(),
  );
});

describe('parseGap', () => {
  it('strips the sign', () => expect(parseGap('+4.512')).toBe(4512));
  it('reads a lapped-style gap', () => expect(parseGap('+1:12.345')).toBe(72345));
  it('accepts a bare duration', () => expect(parseGap('4.512')).toBe(4512));
  it('returns null for garbage', () => expect(parseGap('+lots')).toBeNull());
});

describe('finishStatusOf', () => {
  it.each([
    ['Finished', '1', 'finished'],
    ['+1 Lap', '2', 'finished'],
    ['+3 Laps', '14', 'finished'],
    ['Engine', 'R', 'dnf'],
    ['Accident', 'R', 'dnf'],
    ['Disqualified', 'D', 'dsq'],
    ['Did not start', 'N', 'dns'],
    ['Withdrew', 'W', 'dns'],
  ])('maps %o / %o', (status, positionText, expected) =>
    expect(finishStatusOf(status, positionText)).toBe(expected),
  );
});

describe('deriveLaps', () => {
  const laps = deriveLaps(rawLaps, rawPitStops);

  it('returns one entry per lap, in order', () =>
    expect(laps.map((lap) => lap.lap)).toEqual([1, 2, 3, 4]));

  it('sorts rows by position', () => {
    for (const lap of laps) {
      expect(lap.rows.map((row) => row.position)).toEqual(
        Array.from({ length: lap.rows.length }, (_, index) => index + 1),
      );
    }
  });

  it('drops a retired car from later laps', () => {
    expect(laps[2]?.rows.map((row) => row.driverId)).toEqual(['alpha', 'charlie']);
    expect(laps[3]?.rows).toHaveLength(2);
  });

  it('sums lap times into a cumulative race time', () => {
    expect(rowFor(1, 'alpha').cumulativeMs).toBe(90000);
    expect(rowFor(4, 'alpha').cumulativeMs).toBe(360000);
    expect(rowFor(2, 'bravo').cumulativeMs).toBe(180700);
  });

  it('leaves the leader without a gap or an interval', () => {
    expect(rowFor(2, 'alpha').gapToLeaderMs).toBe(0);
    expect(rowFor(2, 'alpha').intervalMs).toBeNull();
  });

  it('measures the gap to the leader and the interval to the car ahead', () => {
    expect(rowFor(1, 'charlie').gapToLeaderMs).toBe(2000);
    expect(rowFor(1, 'charlie').intervalMs).toBe(1500);
    expect(rowFor(2, 'bravo').gapToLeaderMs).toBe(700);
    expect(rowFor(2, 'bravo').intervalMs).toBe(700);
  });

  it('flags a car within a second of the one ahead', () => {
    expect(rowFor(1, 'bravo').overtake).toBe(true);
    expect(rowFor(1, 'charlie').overtake).toBe(false);
    expect(rowFor(1, 'alpha').overtake).toBe(false);
  });

  it('marks the pit lap and never calls it an overtake', () => {
    expect(rowFor(3, 'charlie').inPit).toBe(true);
    expect(rowFor(2, 'charlie').inPit).toBe(false);
    expect(rowFor(3, 'charlie').overtake).toBe(false);
  });

  it('counts a car as a lap down once it trails by more than a lap', () => {
    expect(rowFor(2, 'charlie').lapsBehind).toBe(0);
    expect(rowFor(3, 'charlie').lapsBehind).toBe(1);
  });

  it('clears the flag when a car unlaps itself', () =>
    expect(rowFor(4, 'charlie').lapsBehind).toBe(0));

  it('poisons the cumulative time after an unreadable lap', () => {
    const broken = deriveLaps(
      [
        { number: '1', Timings: [{ driverId: 'alpha', position: '1', time: '1:30.000' }] },
        { number: '2', Timings: [{ driverId: 'alpha', position: '1', time: 'unknown' }] },
        { number: '3', Timings: [{ driverId: 'alpha', position: '1', time: '1:30.000' }] },
      ],
      [],
    );
    expect(broken[0]?.rows[0]?.cumulativeMs).toBe(90000);
    expect(broken[1]?.rows[0]?.lapTimeMs).toBeNull();
    expect(broken[2]?.rows[0]?.cumulativeMs).toBeNull();
  });

  it('handles an empty race', () => expect(deriveLaps([], [])).toEqual([]));
});

describe('deriveResults', () => {
  const results = deriveResults(rawResults);

  it('keeps the classification order', () =>
    expect(results.map((result) => result.driverId)).toEqual(['alpha', 'charlie', 'bravo']));

  it('reads the winner as an absolute race time', () => {
    expect(results[0]?.timeMs).toBe(360000);
    expect(results[0]?.gapToWinnerMs).toBe(0);
    expect(results[0]?.points).toBe(25);
    expect(results[0]?.finishStatus).toBe('finished');
  });

  it('reads a gap for a car with a +time', () => {
    const [gapped] = deriveResults([
      {
        position: '2',
        positionText: '2',
        points: '18',
        laps: '4',
        status: 'Finished',
        Driver: { driverId: 'bravo' },
        Time: { time: '+4.512' },
      },
    ]);
    expect(gapped?.timeMs).toBeNull();
    expect(gapped?.gapToWinnerMs).toBe(4512);
  });

  it('counts the laps a finisher is down', () => {
    expect(results[1]?.lapsBehind).toBe(1);
    expect(results[1]?.finishStatus).toBe('finished');
    expect(results[1]?.timeMs).toBeNull();
    expect(results[1]?.gapToWinnerMs).toBeNull();
  });

  it('classifies a retirement', () => {
    expect(results[2]?.finishStatus).toBe('dnf');
    expect(results[2]?.positionText).toBe('R');
    expect(results[2]?.laps).toBe(2);
    expect(results[2]?.lapsBehind).toBe(0);
  });

  it('reads a non-numeric position as null', () => {
    const [excluded] = deriveResults([
      {
        position: 'E',
        positionText: 'E',
        points: '0',
        laps: '30',
        status: 'Not classified',
        Driver: { driverId: 'delta' },
      },
    ]);
    expect(excluded?.position).toBeNull();
  });
});
