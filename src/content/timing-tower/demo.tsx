import { useMemo } from 'react';
import { grid } from '@/data/grid';
import { useRaceSimulation } from '@/data/use-race-simulation';
import { TimingTower } from '@/registry/boxbox/ui/timing-tower';
import type { ControlValues } from '../types';
import controls from './controls';

const drivers = Object.fromEntries(grid.drivers.map((driver) => [driver.id, driver]));
const teams = Object.fromEntries(grid.teams.map((team) => [team.id, team]));

export default function TimingTowerDemo({
  mode,
  maxRows,
  highlightTop,
  showTyre,
  showDrs,
  speed,
}: ControlValues<typeof controls.fields>) {
  const { state } = useRaceSimulation({ intervalMs: speed });
  const fastestLapDriverId = useMemo(() => {
    const best = state.sessionBest.lap;
    if (best === null) return null;
    return state.rows.find((row) => row.bestLapTime === best)?.driverId ?? null;
  }, [state]);

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {`LAP ${state.lap} / ${state.totalLaps}`}
      </span>
      <TimingTower
        rows={state.rows}
        drivers={drivers}
        teams={teams}
        mode={mode}
        maxRows={maxRows}
        highlightTop={highlightTop}
        showTyre={showTyre}
        showDrs={showDrs}
        fastestLapDriverId={fastestLapDriverId}
      />
    </div>
  );
}
