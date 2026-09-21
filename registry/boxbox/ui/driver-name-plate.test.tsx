import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Driver, Team } from '@/registry/boxbox/lib/types';
import {
  DRIVER_NAME_PLATE_STATUS_LABELS,
  DriverNamePlate,
  driverDisplayName,
} from '@/registry/boxbox/ui/driver-name-plate';

const driver: Driver = {
  id: 'elian-voss',
  code: 'VOS',
  number: 12,
  firstName: 'Elian',
  lastName: 'Voss',
  teamId: 'aster',
};
const team: Team = { id: 'aster', name: 'Aster Forge', color: '#C78B46' };

describe('driverDisplayName', () => {
  it('returns the code for compact and the full name for full', () => {
    expect(driverDisplayName(driver, 'compact')).toBe('VOS');
    expect(driverDisplayName(driver, 'full')).toBe('Elian VOSS');
    expect(driverDisplayName(driver)).toBe('Elian VOSS');
  });
});

describe('DriverNamePlate', () => {
  it('renders the full name, team, car number, and position', () => {
    const { container } = render(<DriverNamePlate driver={driver} team={team} position={3} />);
    const plate = container.querySelector('[data-slot="driver-name-plate"]');
    expect(plate).toHaveAttribute('data-variant', 'full');
    expect(plate).toHaveAttribute('data-align', 'left');
    expect(screen.getByText('Elian')).toBeInTheDocument();
    expect(screen.getByText('Voss')).toBeInTheDocument();
    expect(screen.getByText('Aster Forge')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders only the three-letter code in the compact variant', () => {
    const { container } = render(
      <DriverNamePlate driver={driver} team={team} position={3} variant="compact" align="right" />,
    );
    const plate = container.querySelector('[data-slot="driver-name-plate"]');
    expect(plate).toHaveAttribute('data-variant', 'compact');
    expect(plate).toHaveAttribute('data-align', 'right');
    expect(screen.getByText('VOS')).toBeInTheDocument();
    expect(screen.queryByText('Voss')).not.toBeInTheDocument();
    expect(screen.queryByText('Aster Forge')).not.toBeInTheDocument();
  });

  it('shows the tag text for every status and records it on the root', () => {
    for (const [status, label] of Object.entries(DRIVER_NAME_PLATE_STATUS_LABELS)) {
      const { container, unmount } = render(
        <DriverNamePlate
          driver={driver}
          team={team}
          status={status as keyof typeof DRIVER_NAME_PLATE_STATUS_LABELS}
        />,
      );
      expect(container.querySelector('[data-slot="driver-name-plate"]')).toHaveAttribute(
        'data-status',
        status,
      );
      expect(container.querySelector('[data-slot="driver-name-plate-status"]')).toHaveTextContent(
        label,
      );
      unmount();
    }
  });

  it('applies the team colour to the accent bar and names every slot', () => {
    const { container } = render(<DriverNamePlate driver={driver} team={team} position={1} />);
    for (const slot of ['position', 'name', 'team', 'status']) {
      const expected = slot === 'status' ? 0 : 1;
      expect(container.querySelectorAll(`[data-slot="driver-name-plate-${slot}"]`)).toHaveLength(
        expected,
      );
    }
    const bar = container.querySelector('[data-slot="driver-name-plate-team"] span');
    expect(bar).toHaveStyle({ backgroundColor: '#C78B46' });
  });

  it('renders the status part only while a status is set', () => {
    const { container, rerender } = render(
      <DriverNamePlate driver={driver} team={team} status="pit" />,
    );
    const status = () => container.querySelectorAll('[data-slot="driver-name-plate-status"]');
    expect(status()).toHaveLength(1);
    rerender(<DriverNamePlate driver={driver} team={team} />);
    expect(container.querySelector('[data-slot="driver-name-plate"]')).toBeInTheDocument();
    expect(screen.getByText('Voss')).toBeInTheDocument();
  });

  it('rolls the position digit', () => {
    const { container } = render(
      <DriverNamePlate driver={driver} team={team} position={4} positionChange={2} />,
    );
    const roller = container.querySelector(
      '[data-slot="driver-name-plate-position"] [data-slot="rolling-number"]',
    );
    expect(roller).toHaveTextContent('4');
  });

  it('renders no plate when it starts hidden', () => {
    const { container } = render(<DriverNamePlate driver={driver} team={team} visible={false} />);
    expect(container.querySelector('[data-slot="driver-name-plate"]')).toBeNull();
    expect(screen.queryByText('Voss')).not.toBeInTheDocument();
  });
});
