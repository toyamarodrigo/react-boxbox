import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import type { ReactElement } from 'react';
import type { Driver, Team, TimingRow } from '@/registry/boxbox/lib/types';
import { BattleCard } from '@/registry/boxbox/ui/battle-card';
import { DriverNamePlate } from '@/registry/boxbox/ui/driver-name-plate';
import { PitStopCard } from '@/registry/boxbox/ui/pit-stop-card';
import { ReplayBumper } from '@/registry/boxbox/ui/replay-bumper';
import { SectorTimes } from '@/registry/boxbox/ui/sector-times';
import { StartLights } from '@/registry/boxbox/ui/start-lights';
import { TeamRadio } from '@/registry/boxbox/ui/team-radio';
import { TimingTower } from '@/registry/boxbox/ui/timing-tower';
import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';

const driver: Driver = {
  id: 'elian-voss',
  code: 'EVO',
  number: 12,
  firstName: 'Elian',
  lastName: 'Voss',
  teamId: 'aster',
};
const second: Driver = {
  id: 'mira-solen',
  code: 'MSO',
  number: 37,
  firstName: 'Mira',
  lastName: 'Solen',
  teamId: 'aster',
};
const team: Team = { id: 'aster', name: 'Aster Forge', color: '#C78B46' };

function timingRow(overrides: Partial<TimingRow> & Pick<TimingRow, 'driverId' | 'position'>) {
  return {
    gapToLeader: null,
    interval: null,
    lastLapTime: 91.512,
    bestLapTime: 91.512,
    sectors: [
      { time: 28.914, status: 'fastest' },
      { time: 31.207, status: 'personal' },
      { time: 29.633, status: 'slower' },
    ],
    tyre: { compound: 'S', age: 11 },
    inPit: false,
    lapped: false,
    drs: false,
    positionChange: 0,
    ...overrides,
  } satisfies TimingRow;
}

const rows: TimingRow[] = [
  timingRow({ driverId: 'elian-voss', position: 1 }),
  timingRow({ driverId: 'mira-solen', position: 2, interval: 1.234, positionChange: 2 }),
];
const drivers = { 'elian-voss': driver, 'mira-solen': second };
const teams = { aster: team };

/** Every component, rendered the way a consumer would see it on the page. */
const components: [string, ReactElement][] = [
  ['Tyre Badge', <TyreBadge key="t" compound="S" age={11} />],
  [
    'Sector Times',
    <SectorTimes
      key="s"
      sectors={[
        { time: 28.914, status: 'fastest' },
        { time: 31.207, status: 'personal' },
        { time: 29.633, status: 'slower' },
      ]}
      lapTime={89.754}
      lapStatus="personal"
    />,
  ],
  [
    'Driver Name Plate',
    <DriverNamePlate key="d" driver={driver} team={team} position={1} status="pit" />,
  ],
  ['Start Lights', <StartLights key="l" state={{ phase: 'lit', lit: 5 }} />],
  [
    'Timing Tower',
    <TimingTower key="o" rows={rows} drivers={drivers} teams={teams} mode="interval" />,
  ],
  [
    'Replay Bumper',
    <ReplayBumper key="r" play={false}>
      <span>CAM 04</span>
    </ReplayBumper>,
  ],
  [
    'Team Radio',
    <TeamRadio
      key="m"
      from="RACE ENGINEER"
      to="EVO"
      words={[
        { text: 'Box,', at: 0.2 },
        { text: 'box.', at: 0.6 },
      ]}
      envelope={[0.3, 0.8, 0.5]}
    />,
  ],
  [
    'Pit Stop Card',
    <PitStopCard
      key="p"
      code="MSO"
      stop={2}
      laneTime={22.4}
      compoundOff="M"
      compoundOn="H"
      positionIn={3}
      positionOut={5}
    />,
  ],
  [
    'Battle Card',
    <BattleCard
      key="b"
      position={4}
      ahead={{ code: 'TRE' }}
      behind={{ code: 'NVA' }}
      interval={0.482}
      trend={-0.3}
      overtake
    />,
  ],
];

describe('reduced motion', () => {
  // `MotionConfig reducedMotion="always"` is what the site's `reducedMotion="user"`
  // resolves to for a visitor who asks for less motion. Content must survive it:
  // transform and layout animation are dropped, so anything that only existed as
  // a keyframe would disappear.
  it.each(components)('renders %s with motion disabled', (_name, element) => {
    const { container } = render(<MotionConfig reducedMotion="always">{element}</MotionConfig>);
    expect(container.firstElementChild).not.toBeNull();
    expect(container.textContent?.trim()).not.toBe('');
  });

  it('keeps every value and state readable with motion disabled', () => {
    render(
      <MotionConfig reducedMotion="always">
        <div>{components.map(([, element]) => element)}</div>
      </MotionConfig>,
    );
    // Timing Tower: positions, driver codes and the value column.
    expect(screen.getByRole('list', { name: 'Timing tower' })).toBeInTheDocument();
    expect(screen.getAllByText('EVO').length).toBeGreaterThan(0);
    expect(screen.getByText('LEADER')).toBeInTheDocument();
    expect(screen.getByText('+1.234')).toBeInTheDocument();
    // Sector Times: each sector time and the lap.
    expect(screen.getAllByText('28.914').length).toBeGreaterThan(0);
    expect(screen.getByText('1:29.754')).toBeInTheDocument();
    // Start Lights: the state is text, not only lit pixels.
    expect(screen.getByText('Lights: 5 of 5')).toBeInTheDocument();
    // Driver Name Plate: the wipe is a clip path, so the name is always present.
    expect(screen.getByText('Voss')).toBeInTheDocument();
    expect(screen.getByText('PIT')).toBeInTheDocument();
    // Replay Bumper: the content behind the overlay.
    expect(screen.getByText('CAM 04')).toBeInTheDocument();
    // Team Radio: the transcript is text, not only the painted pop-in.
    expect(screen.getByText('Team radio, RACE ENGINEER to EVO: Box, box.')).toBeInTheDocument();
    // Pit Stop Card: the wipe is a clip path, so the stop reads in full from the first frame.
    expect(
      screen.getByText(
        'MSO pit stop 2, medium tyres off, hard on, pit lane 22.4 seconds, in P3, out P5.',
      ),
    ).toBeInTheDocument();
    // Battle Card: the wipe and the swap are motion only, so the battle reads in full.
    expect(
      screen.getByText(
        'Battle for P4, TRE overtook NVA, interval 0.482 seconds, closing 0.3 seconds a lap.',
      ),
    ).toBeInTheDocument();
  });
});

describe('accessible names and state', () => {
  it('gives the Tyre Badge a name from its compound and age', () => {
    render(<TyreBadge compound="M" age={1} />);
    expect(screen.getByRole('img', { name: 'Medium tyre, 1 lap' })).toBeInTheDocument();
    render(<TyreBadge compound="H" isNew />);
    expect(screen.getByRole('img', { name: 'Hard tyre, new' })).toBeInTheDocument();
  });

  it('announces Start Lights state through a polite live region', () => {
    const { rerender } = render(<StartLights state={{ phase: 'arming', lit: 3 }} />);
    const gantry = screen.getByRole('status');
    expect(gantry).toHaveAttribute('aria-live', 'polite');
    expect(gantry).toHaveTextContent('Lights: 3 of 5');
    rerender(<StartLights state={{ phase: 'out', lit: 0 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Lights out');
    rerender(<StartLights state={{ phase: 'aborted', lit: 5 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Start aborted');
  });

  it('labels each Timing Tower row with its position, driver and value', () => {
    render(<TimingTower rows={rows} drivers={drivers} teams={teams} mode="interval" />);
    const items = screen.getAllByRole('listitem');
    // The tyre badge sits between the driver and the value, so match in order.
    expect(items[0]).toHaveTextContent(/^Position1EVO.*IntervalLEADER$/);
    expect(items[1]).toHaveTextContent(/^Position2MSO.*gained 2 places.*Interval\+1\.234$/);
  });

  it('names the value column after the gap mode', () => {
    const { rerender } = render(
      <TimingTower rows={rows} drivers={drivers} teams={teams} mode="leader" />,
    );
    expect(screen.getAllByText('Gap to leader').length).toBe(2);
    rerender(<TimingTower rows={rows} drivers={drivers} teams={teams} mode="lapTime" />);
    expect(screen.getAllByText('Last lap').length).toBe(2);
  });

  it('speaks the sector status that is otherwise only a colour', () => {
    render(
      <SectorTimes
        sectors={[
          { time: 28.914, status: 'fastest' },
          { time: 31.207, status: 'personal' },
          { time: null, status: 'unset' },
        ]}
        lapTime={89.754}
        lapStatus="fastest"
      />,
    );
    const panel = screen.getByRole('group', { name: 'Sector times' });
    expect(panel).toHaveTextContent(', session fastest');
    expect(panel).toHaveTextContent(', personal best');
    expect(panel).toHaveTextContent(', not set');
  });

  it('hides the Team Radio trace, reads the transcript once and names the control', () => {
    render(
      <TeamRadio
        from="RACE ENGINEER"
        to="EVO"
        words={[{ text: 'Box.', at: 0 }]}
        src="/audio/box.wav"
      />,
    );
    expect(document.querySelector('[data-slot="waveform"]')).toHaveAttribute('aria-hidden');
    expect(document.querySelector('[data-slot="team-radio-header"]')).toHaveAttribute(
      'aria-hidden',
    );
    expect(screen.getByText('Team radio, RACE ENGINEER to EVO: Box.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play team radio' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('hides the painted Pit Stop Card and reads the stop once', () => {
    render(<PitStopCard code="EVO" stop={1} laneTime={9.8} compoundOff="S" positionIn={4} />);
    const card = document.querySelector('[data-slot="pit-stop-card"]');
    for (const painted of card?.querySelectorAll(':scope > :not(.sr-only)') ?? []) {
      expect(painted).toHaveAttribute('aria-hidden');
    }
    expect(screen.getByText('EVO pit stop 1, pit lane 9.8 seconds, in P4.')).toBeInTheDocument();
  });

  it('hides the painted Battle Card and reads the battle once', () => {
    render(
      <BattleCard position={2} ahead={{ code: 'EVO' }} behind={{ code: 'MSO' }} interval={1.2} />,
    );
    const card = document.querySelector('[data-slot="battle-card"]');
    for (const painted of card?.querySelectorAll(':scope > :not(.sr-only)') ?? []) {
      expect(painted).toHaveAttribute('aria-hidden');
    }
    expect(
      screen.getByText('Battle for P2, EVO ahead of MSO, interval 1.200 seconds.'),
    ).toBeInTheDocument();
  });

  it('hides the Replay Bumper overlay from assistive tech and names the run', () => {
    const { container } = render(
      <ReplayBumper play label="REPLAY">
        <span>CAM 04</span>
      </ReplayBumper>,
    );
    const overlay = container.querySelector('[data-slot="replay-bumper-overlay"]');
    expect(overlay).toHaveAttribute('aria-hidden');
    expect(screen.getByRole('status')).toHaveTextContent('REPLAY');
  });
});
