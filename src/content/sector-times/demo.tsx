import type { SectorTime } from '@/registry/boxbox/lib/types';
import { SectorTimes } from '@/registry/boxbox/ui/sector-times';
import { useRaceSimulation } from '../../data/use-race-simulation';
import type { ControlValues } from '../types';
import type controls from './controls';

const STATIC_TIMES = [28.914, 31.207, 29.633] as const;

export default function SectorTimesDemo({
  layout,
  miniSectors,
  countUp,
  live,
  s1Status,
  s2Status,
  s3Status,
}: ControlValues<typeof controls.fields>) {
  const { state } = useRaceSimulation({ intervalMs: 1500 });
  const leader = state.rows[0];

  const staticSectors: [SectorTime, SectorTime, SectorTime] = [
    { time: STATIC_TIMES[0], status: s1Status },
    { time: STATIC_TIMES[1], status: s2Status },
    { time: STATIC_TIMES[2], status: s3Status },
  ];

  const sectors = live && leader ? leader.sectors : staticSectors;
  const lapTime = live && leader ? leader.lastLapTime : 89.754;
  const lapStatus =
    live && leader
      ? leader.lastLapTime === state.sessionBest.lap
        ? 'fastest'
        : 'personal'
      : 'personal';

  return (
    <div className="w-full max-w-sm">
      <SectorTimes
        sectors={sectors}
        lapTime={lapTime}
        lapStatus={lapStatus}
        miniSectors={miniSectors}
        layout={layout}
        countUp={countUp}
      />
    </div>
  );
}
