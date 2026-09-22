import { grid } from '@/data/grid';
import { useRaceSimulation } from '@/data/use-race-simulation';
import { SpeedTrap } from '@/registry/boxbox/ui/speed-trap';
import type { ControlValues } from '../types';
import controls from './controls';

const driversById = Object.fromEntries(grid.drivers.map((driver) => [driver.id, driver]));
const teamsById = Object.fromEntries(grid.teams.map((team) => [team.id, team]));

export default function SpeedTrapDemo({
  code,
  unit,
  size,
  showBest,
  speed,
}: ControlValues<typeof controls.fields>) {
  const { state } = useRaceSimulation({ intervalMs: speed });
  const driver = grid.drivers.find((entry) => entry.code === code) ?? grid.drivers[0]!;
  const reading = state.speedTrap.byDriver[driver.id] ?? null;
  const best = state.speedTrap.best;
  const bestDriver = best === null ? undefined : driversById[best.driverId];

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {`Lap ${state.lap} / ${state.totalLaps}`}
      </p>
      <SpeedTrap
        code={driver.code}
        color={teamsById[driver.teamId]?.color}
        speed={reading}
        unit={unit}
        size={size}
        sessionBest={
          showBest && best !== null && bestDriver !== undefined
            ? { code: bestDriver.code, speed: best.speed }
            : null
        }
      />
    </div>
  );
}
