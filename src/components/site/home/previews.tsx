import { lazy, Suspense, type ReactNode } from 'react';
import type { contentSlugs } from '@/content/slugs';
import { FICTIONAL_CIRCUIT, FICTIONAL_SECTORS } from '@/content/track-map/circuit';
import { TEAM_RADIO_ENVELOPE, TEAM_RADIO_WORDS } from '@/content/team-radio/radio';
import { drivers, grid, teams } from '@/data/grid';
import { createInitialRace, createSeededRng } from '@/data/simulation';
import type { TrackMarker, TrackSector } from '@/registry/boxbox/lib/types';
import { BattleCard } from '@/registry/boxbox/ui/battle-card';
import { DriverNamePlate } from '@/registry/boxbox/ui/driver-name-plate';
import { FlagBanner } from '@/registry/boxbox/ui/flag-banner';
import { Gauge } from '@/registry/boxbox/ui/gauge';
import { LapCounter } from '@/registry/boxbox/ui/lap-counter';
import { OvertakeIndicator } from '@/registry/boxbox/ui/overtake-indicator';
import { PitStopCard } from '@/registry/boxbox/ui/pit-stop-card';
import {
  Podium,
  PodiumStep,
  type PodiumEntry,
  type PodiumSteps,
} from '@/registry/boxbox/ui/podium';
import { RaceClock } from '@/registry/boxbox/ui/race-clock';
import { ReplayBumper } from '@/registry/boxbox/ui/replay-bumper';
import { SectorTimes } from '@/registry/boxbox/ui/sector-times';
import { SpeedTrap } from '@/registry/boxbox/ui/speed-trap';
import { Standings, type StandingsEntry } from '@/registry/boxbox/ui/standings';
import { StartLights } from '@/registry/boxbox/ui/start-lights';
import { StintBar, type StintBarStint } from '@/registry/boxbox/ui/stint-bar';
import { TeamRadio } from '@/registry/boxbox/ui/team-radio';
import { TimingTower } from '@/registry/boxbox/ui/timing-tower';
import { TrackMap } from '@/registry/boxbox/ui/track-map';
import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';

// Recharts stays out of the entry chunk: the chart arrives in its own module.
const GapChartPreview = lazy(() => import('./gap-chart-preview'));

// One frozen frame of the grid, built once at module load. The previews never tick.
const previewRows = createInitialRace(grid, createSeededRng(7)).rows.slice(0, 4);
const driversById = Object.fromEntries(drivers.map((driver) => [driver.id, driver]));
const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]));
const previewDriver = drivers[0];
const previewTeam = previewDriver ? teamsById[previewDriver.teamId] : undefined;
const teamColor = (teamId: string) => teamsById[teamId]?.color ?? 'currentColor';

const podiumEntry = (index: number): PodiumEntry | undefined => {
  const driver = drivers[index];
  const team = driver ? teamsById[driver.teamId] : undefined;
  return driver && team ? { driver, team } : undefined;
};
const [first, second, third] = [podiumEntry(0), podiumEntry(1), podiumEntry(2)];
const podiumSteps: PodiumSteps | undefined =
  first && second && third ? [first, second, third] : undefined;

// Yellow in the middle sector, so the sector overlay shows too.
const trackSectors: TrackSector[] = FICTIONAL_SECTORS.map((sector, index) =>
  index === 1 ? { ...sector, status: 'yellow' } : sector,
);
const trackMarkers: TrackMarker[] = [0.12, 0.3, 0.52, 0.78].flatMap((progress, index) => {
  const driver = drivers[index];
  if (!driver) return [];
  return [
    {
      id: driver.id,
      progress,
      color: teamColor(driver.teamId),
      code: driver.code,
      emphasis: index === 0,
    },
  ];
});

const STINT_LAPS = 57;
const STINT_LAP = 38;
const stints: StintBarStint[][] = [
  [
    { fromLap: 1, toLap: 18, compound: 'M' },
    { fromLap: 19, toLap: 40, compound: 'H' },
    { fromLap: 41, toLap: 57, compound: 'S' },
  ],
  [
    { fromLap: 1, toLap: 14, compound: 'S' },
    { fromLap: 15, toLap: 36, compound: 'M' },
    { fromLap: 37, toLap: 57, compound: 'H' },
  ],
  [
    { fromLap: 1, toLap: 22, compound: 'M' },
    { fromLap: 23, toLap: 45, compound: 'H' },
    { fromLap: 46, toLap: 57, compound: 'S' },
  ],
];
const stintCars = stints.flatMap((carStints, index) => {
  const driver = drivers[index];
  return driver ? [{ driver, stints: carStints }] : [];
});

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
      // `stack` keeps the label, bar and time on one line each, so nothing
      // collides in the narrow card the way three side-by-side sectors do.
      layout="stack"
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
      showOvertake={false}
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

function LapCounterPreview() {
  return <LapCounter lap={42} totalLaps={57} size="lg" />;
}

function RaceClockPreview() {
  // 1:23:45 elapsed.
  return <RaceClock ms={5_025_000} direction="up" size="lg" />;
}

function FlagBannerPreview() {
  return <FlagBanner status="yellow" sector={2} size="sm" className="max-w-56" />;
}

function OvertakeIndicatorPreview() {
  return (
    <div className="flex items-center gap-2">
      <OvertakeIndicator mode="overtake" state="off" size="lg" />
      <OvertakeIndicator mode="overtake" state="available" size="lg" />
      <OvertakeIndicator mode="overtake" state="active" size="lg" />
    </div>
  );
}

function PodiumPreview() {
  if (!podiumSteps) return null;
  // Steps a little narrower than `sm`'s 5rem: three of those overflow the narrowest box (~14.5rem).
  return (
    <Podium
      steps={podiumSteps}
      size="sm"
      renderStep={(props) => <PodiumStep {...props} className="w-[4.5rem]" />}
    />
  );
}

function TrackMapPreview() {
  return (
    <TrackMap
      path={FICTIONAL_CIRCUIT.d}
      pitLane={FICTIONAL_CIRCUIT.pit.d}
      viewBox={FICTIONAL_CIRCUIT.viewBox}
      sectors={trackSectors}
      markers={trackMarkers}
      size="sm"
      // 1000 × 600 viewBox: 13rem wide is about 7.5rem tall, clear of the box.
      className="w-52"
    />
  );
}

function StintBarPreview() {
  return (
    <ul className="flex w-56 list-none flex-col gap-2">
      {stintCars.map(({ driver, stints: carStints }) => (
        <li key={driver.id} className="flex items-center gap-2">
          <span className="w-8 font-display text-xs font-bold uppercase tracking-wider">
            {driver.code}
          </span>
          <span className="h-4 w-[3px]" style={{ backgroundColor: teamColor(driver.teamId) }} />
          <StintBar
            className="flex-1"
            stints={carStints}
            totalLaps={STINT_LAPS}
            currentLap={STINT_LAP}
          />
        </li>
      ))}
    </ul>
  );
}

function GapChartPreviewLazy() {
  return (
    <Suspense fallback={null}>
      <GapChartPreview />
    </Suspense>
  );
}

function SpeedTrapPreview() {
  const driver = drivers[0];
  if (!driver) return null;
  return (
    <SpeedTrap
      code={driver.code}
      color={teamColor(driver.teamId)}
      speed={318}
      sessionBest={{ code: drivers[1]?.code ?? 'MSO', speed: 322 }}
    />
  );
}

function GaugePreview() {
  return <Gauge value={11_600} gear={7} size="md" showValue />;
}

function TeamRadioPreview() {
  // At rest the card shows the whole message and the tail of its envelope: nothing runs.
  // The card is wider than the narrowest tile, so the thumbnail is scaled down from its centre.
  return (
    <div className="shrink-0 scale-[0.6]">
      <TeamRadio
        from="RACE ENGINEER"
        to={drivers[0]?.code ?? 'EVO'}
        words={TEAM_RADIO_WORDS}
        envelope={TEAM_RADIO_ENVELOPE}
        size="sm"
        bars={12}
      />
    </div>
  );
}

function PitStopCardPreview() {
  // A stop that is over: the lane time has settled and the position out is known.
  const driver = drivers[2];
  if (!driver) return null;
  return (
    <PitStopCard
      code={driver.code}
      color={teamColor(driver.teamId)}
      stop={2}
      laneTime={22.4}
      compoundOff="M"
      compoundOn="H"
      positionIn={3}
      positionOut={5}
      size="sm"
    />
  );
}

function BattleCardPreview() {
  // A battle for third with the car behind closing: no pass, so no tag.
  const [ahead, behind] = [drivers[3], drivers[4]];
  if (!ahead || !behind) return null;
  return (
    <BattleCard
      position={3}
      ahead={{ code: ahead.code, color: teamColor(ahead.teamId) }}
      behind={{ code: behind.code, color: teamColor(behind.teamId) }}
      interval={0.482}
      trend={-0.3}
      size="sm"
    />
  );
}

// The top of an invented table mid-race, as `[points, gained, positionChange]`: the car leading
// the race has just taken the lead of the championship too.
const standingsEntries: StandingsEntry[] = [
  [186, 25, 1],
  [176, 8, -1],
  [170, 10, 0],
  [165, 15, 0],
  [131, 0, 0],
].flatMap(([points = 0, gained = 0, positionChange = 0], index) => {
  const driver = drivers[index];
  if (!driver) return [];
  return [
    {
      id: driver.id,
      name: driver.code,
      color: teamColor(driver.teamId),
      position: index + 1,
      points,
      gained,
      positionChange,
    },
  ];
});

function StandingsPreview() {
  return <Standings entries={standingsEntries} size="sm" className="w-56" />;
}

type VisibleSlug = Exclude<(typeof contentSlugs)[number], 'example'>;

// A new slug without an entry here is a type error, not a blank card.
const previews = {
  'tyre-badge': TyreBadgePreview,
  'sector-times': SectorTimesPreview,
  'driver-name-plate': DriverNamePlatePreview,
  'start-lights': StartLightsPreview,
  'timing-tower': TimingTowerPreview,
  'replay-bumper': ReplayBumperPreview,
  'lap-counter': LapCounterPreview,
  'race-clock': RaceClockPreview,
  'flag-banner': FlagBannerPreview,
  'overtake-indicator': OvertakeIndicatorPreview,
  podium: PodiumPreview,
  'track-map': TrackMapPreview,
  'stint-bar': StintBarPreview,
  'gap-chart': GapChartPreviewLazy,
  'speed-trap': SpeedTrapPreview,
  gauge: GaugePreview,
  'team-radio': TeamRadioPreview,
  'pit-stop-card': PitStopCardPreview,
  'battle-card': BattleCardPreview,
  standings: StandingsPreview,
} satisfies Record<VisibleSlug, () => ReactNode>;

const hasPreview = (slug: string): slug is VisibleSlug => Object.hasOwn(previews, slug);

/** A cheap, static thumbnail of the real component for one registry slug. */
export function ComponentPreview({ slug }: { slug: string }) {
  if (!hasPreview(slug)) return null;
  const Preview = previews[slug];
  return <Preview />;
}
