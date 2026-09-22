import { useCallback, useMemo, useState } from 'react';
import { grid } from '@/data/grid';
import { useRaceSimulation } from '@/data/use-race-simulation';
import type { TimingRow } from '@/registry/boxbox/lib/types';
import { Podium } from '@/registry/boxbox/ui/podium';
import { TimingTower } from '@/registry/boxbox/ui/timing-tower';
import type { ControlValues } from '../types';
import controls from './controls';
import { useResultsPresentation } from './use-results-presentation';

const drivers = Object.fromEntries(grid.drivers.map((driver) => [driver.id, driver]));
const teams = Object.fromEntries(grid.teams.map((team) => [team.id, team]));

export default function TimingTowerDemo({
  mode,
  maxRows,
  highlightTop,
  showTyre,
  showOvertake,
  overtakeMode,
  followable,
  speed,
}: ControlValues<typeof controls.fields>) {
  const { state, finished } = useRaceSimulation({ intervalMs: speed });
  const [followedId, setFollowedId] = useState<string | null>(null);
  const onRowClick = useCallback(
    (row: TimingRow) =>
      setFollowedId((current) => (current === row.driverId ? null : row.driverId)),
    [],
  );
  const fastestLapDriverId = useMemo(() => {
    const best = state.sessionBest.lap;
    if (best === null) return null;
    return state.rows.find((row) => row.bestLapTime === best)?.driverId ?? null;
  }, [state]);
  const results = useResultsPresentation({
    rows: state.rows,
    mode,
    finished,
    drivers,
    teams,
  });

  return (
    <div className="flex flex-col gap-4">
      {results.podium && <Podium steps={results.podium} size="sm" />}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {results.mode === 'results'
            ? 'FINAL CLASSIFICATION'
            : `LAP ${state.lap} / ${state.totalLaps}`}
        </span>
        <TimingTower
          rows={results.rows}
          drivers={drivers}
          teams={teams}
          mode={results.mode}
          maxRows={maxRows}
          highlightTop={highlightTop}
          showTyre={showTyre}
          showOvertake={showOvertake}
          overtakeMode={overtakeMode}
          fastestLapDriverId={fastestLapDriverId}
          followedId={followable ? followedId : null}
          onRowClick={followable ? onRowClick : undefined}
        />
        {followable && (
          <span className="text-xs text-muted-foreground">
            Click a row to follow that driver; click it again to let it go.
          </span>
        )}
      </div>
    </div>
  );
}
