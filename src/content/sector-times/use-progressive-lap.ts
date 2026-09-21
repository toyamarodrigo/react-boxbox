import { useEffect, useState } from 'react';

import type { SectorStatus, SectorTime } from '@/registry/boxbox/lib/types';

const UNSET: SectorTime = { time: null, status: 'unset' };

export type ProgressiveLap = {
  sectors: [SectorTime, SectorTime, SectorTime];
  lapTime: number | null;
  lapStatus: SectorStatus;
};

export type UseProgressiveLapOptions = ProgressiveLap & { intervalMs: number };

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
  const [revealed, setRevealed] = useState<ProgressiveLap>({
    sectors: [sectors[0], UNSET, UNSET],
    lapTime: null,
    lapStatus: 'unset',
  });

  // A new lap is identified by its sector times; the same lap must not restart the reveal.
  const lapKey = sectors.map((sector) => sector.time).join('|');

  useEffect(() => {
    // Every stage runs from a timer, including S1, so the effect never sets state
    // synchronously and the reveal order is owned by one mechanism.
    const first = setTimeout(
      () =>
        setRevealed((current) => ({
          sectors: [sectors[0], UNSET, UNSET],
          // Hold the previous lap time so the count-up animates from a real value.
          lapTime: current.lapTime,
          lapStatus: current.lapStatus,
        })),
      0,
    );
    const second = setTimeout(
      () => setRevealed((current) => ({ ...current, sectors: [sectors[0], sectors[1], UNSET] })),
      intervalMs / 3,
    );
    const third = setTimeout(
      () => setRevealed({ sectors: [sectors[0], sectors[1], sectors[2]], lapTime, lapStatus }),
      (2 * intervalMs) / 3,
    );
    return () => {
      clearTimeout(first);
      clearTimeout(second);
      clearTimeout(third);
    };
    // `lapKey` stands in for the lap identity; the payload is read fresh inside the effect.
    // oxlint-disable-next-line exhaustive-deps
  }, [lapKey, intervalMs]);

  return revealed;
}
