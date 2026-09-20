import { drivers, teams } from '@/data/grid';
import { DriverNamePlate } from '@/registry/boxbox/ui/driver-name-plate';
import type { ControlValues } from '../types';
import controls from './controls';

export default function DriverNamePlateDemo({
  driver: code,
  position,
  variant,
  status,
  visible,
  align,
}: ControlValues<typeof controls.fields>) {
  const driver = drivers.find((entry) => entry.code === code);
  if (!driver) return null;
  const team = teams.find((entry) => entry.id === driver.teamId);

  return (
    <DriverNamePlate
      driver={driver}
      team={team}
      position={position}
      variant={variant}
      status={status === 'none' ? undefined : status}
      visible={visible}
      align={align}
    />
  );
}
