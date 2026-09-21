import type { SectorTime } from '@/registry/boxbox/lib/types';
import { SectorTimes } from '@/registry/boxbox/ui/sector-times';
import { useRaceSimulation } from '@/data/use-race-simulation';
import type { ControlValues } from '../types';
import type controls from './controls';
import { useProgressiveLap } from './use-progressive-lap';

const STATIC_TIMES = [28.914, 31.207, 29.633] as const;
const INTERVAL_MS = 1500;
const UNSET_LAP: [SectorTime, SectorTime, SectorTime] = [
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
  { time: null, status: 'unset' },
];

export default function SectorTimesDemo({
  layout,
  miniSectors,
  countUp,
  live,
  s1Status,
  s2Status,
  s3Status,
}: ControlValues<typeof controls.fields>) {
  const { state } = useRaceSimulation({ intervalMs: INTERVAL_MS });
  const leader = state.rows[0];

  // The simulator delivers a whole lap at once; the hook paces it out sector by sector.
  const paced = useProgressiveLap({
    sectors: leader ? leader.sectors : UNSET_LAP,
    lapTime: leader ? leader.lastLapTime : null,
    lapStatus: leader && leader.lastLapTime === state.sessionBest.lap ? 'fastest' : 'personal',
    intervalMs: INTERVAL_MS,
  });

  const staticSectors: [SectorTime, SectorTime, SectorTime] = [
    { time: STATIC_TIMES[0], status: s1Status },
    { time: STATIC_TIMES[1], status: s2Status },
    { time: STATIC_TIMES[2], status: s3Status },
  ];

  return (
    <div className="w-full max-w-sm">
      <SectorTimes
        sectors={live ? paced.sectors : staticSectors}
        lapTime={live ? paced.lapTime : 89.754}
        lapStatus={live ? paced.lapStatus : 'personal'}
        miniSectors={miniSectors}
        layout={layout}
        countUp={countUp}
      />
    </div>
  );
}
