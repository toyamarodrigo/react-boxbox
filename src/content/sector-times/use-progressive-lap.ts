import { useEffect, useState } from 'react';

import type { SectorStatus, SectorTime } from '@/registry/boxbox/lib/types';

const UNSET: SectorTime = { time: null, status: 'unset' };

export type ProgressiveLap = {
  sectors: [SectorTime, SectorTime, SectorTime];
  lapTime: number | null;
  lapStatus: SectorStatus;
};

export type UseProgressiveLapOptions = ProgressiveLap & { intervalMs: number };

type Lap = Pick<ProgressiveLap, 'lapTime' | 'lapStatus'>;

/** How far the current lap has been revealed: S1 only, S1 + S2, or the whole lap. */
type Stage = { lapKey: string; stage: 0 | 1 | 2; lap: Lap };

/**
 * Paces a completed lap out over one simulator tick.
 *
 * The simulator hands over all three sectors at once, which makes the panel flash
 * as a single block. This reveals S1 at `0`, S2 at `intervalMs / 3`, and S3 with the
 * lap time and status at `2 * intervalMs / 3`, so the demo reads like a car actually
 * going round. Sectors that have not landed yet are `unset`, and the lap time keeps
 * the previous lap's value until S3 arrives so the count-up has somewhere to start.
 */
export function useProgressiveLap({
  sectors,
  lapTime,
  lapStatus,
  intervalMs,
}: UseProgressiveLapOptions): ProgressiveLap {
  // A lap is identified by its sector times. A new lap is at stage 0 until its timers run.
  const lapKey = sectors.map((sector) => sector.time).join('|');
  const [state, setState] = useState<Stage>({
    lapKey,
    stage: 0,
    lap: { lapTime: null, lapStatus: 'unset' },
  });
  const stage = state.lapKey === lapKey ? state.stage : 0;

  useEffect(() => {
    const second = setTimeout(
      () => setState((current) => ({ ...current, lapKey, stage: 1 })),
      intervalMs / 3,
    );
    const third = setTimeout(
      () => setState({ lapKey, stage: 2, lap: { lapTime, lapStatus } }),
      (2 * intervalMs) / 3,
    );
    return () => {
      clearTimeout(second);
      clearTimeout(third);
    };
  }, [lapKey, lapTime, lapStatus, intervalMs]);

  return {
    sectors: [sectors[0], stage >= 1 ? sectors[1] : UNSET, stage >= 2 ? sectors[2] : UNSET],
    ...state.lap,
  };
}
