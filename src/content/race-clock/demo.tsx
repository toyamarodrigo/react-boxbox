import { RaceClock } from '@/registry/boxbox/ui/race-clock';
import type { ControlValues } from '../types';
import controls from './controls';

export default function RaceClockDemo({
  seconds,
  direction,
  showHours,
  label,
  size,
}: ControlValues<typeof controls.fields>) {
  return (
    <RaceClock
      ms={seconds * 1000}
      direction={direction}
      showHours={showHours}
      label={label}
      size={size}
    />
  );
}
