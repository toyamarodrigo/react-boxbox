import { drivers, grid, teams } from '@/data/grid';
import { createInitialRace, createSeededRng } from '@/data/simulation';
import { DriverNamePlate } from '@/registry/boxbox/ui/driver-name-plate';
import { ReplayBumper } from '@/registry/boxbox/ui/replay-bumper';
import { SectorTimes } from '@/registry/boxbox/ui/sector-times';
import { StartLights } from '@/registry/boxbox/ui/start-lights';
import { TimingTower } from '@/registry/boxbox/ui/timing-tower';
import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';

// One frozen frame of the grid, built once at module load. The previews never tick.
const previewRows = createInitialRace(grid, createSeededRng(7)).rows.slice(0, 4);
const driversById = Object.fromEntries(drivers.map((driver) => [driver.id, driver]));
const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]));
const previewDriver = drivers[0];
const previewTeam = previewDriver ? teamsById[previewDriver.teamId] : undefined;

function TyreBadgePreview() {
  return (
    <div className="flex items-center gap-4">
      <TyreBadge compound="S" age={11} size="lg" />
      <TyreBadge compound="M" isNew size="lg" />
    </div>
  );
}

function SectorTimesPreview() {
  return (
    <SectorTimes
      className="w-56"
      sectors={[
        { time: 28.914, status: 'fastest' },
        { time: 31.207, status: 'personal' },
        { time: 29.633, status: 'slower' },
      ]}
      lapTime={89.754}
      lapStatus="personal"
      miniSectors={3}
    />
  );
}

function DriverNamePlatePreview() {
  if (!previewDriver) return null;
  return <DriverNamePlate driver={previewDriver} team={previewTeam} position={1} variant="full" />;
}

function StartLightsPreview() {
  // Controlled and parked on the final lit frame: no sequence runs here.
  return <StartLights size="sm" state={{ phase: 'lit', lit: 5 }} />;
}

function TimingTowerPreview() {
  return (
    <TimingTower
      rows={previewRows}
      drivers={driversById}
      teams={teamsById}
      maxRows={4}
      highlightTop={1}
      showDrs={false}
      className="w-52"
    />
  );
}

function ReplayBumperPreview() {
  return (
    <ReplayBumper
      play={false}
      className="h-24 w-56 overflow-hidden border border-border bg-card text-card-foreground"
    >
      <div className="flex h-full flex-col justify-between p-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          CAM 04
        </span>
        <span className="font-display text-2xl font-black uppercase italic tracking-tight">
          LIVE
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          turn 9 · lap 29
        </span>
      </div>
    </ReplayBumper>
  );
}

/** A cheap, static thumbnail of the real component for one registry slug. */
export function ComponentPreview({ slug }: { slug: string }) {
  switch (slug) {
    case 'tyre-badge':
      return <TyreBadgePreview />;
    case 'sector-times':
      return <SectorTimesPreview />;
    case 'driver-name-plate':
      return <DriverNamePlatePreview />;
    case 'start-lights':
      return <StartLightsPreview />;
    case 'timing-tower':
      return <TimingTowerPreview />;
    case 'replay-bumper':
      return <ReplayBumperPreview />;
    default:
      return null;
  }
}
