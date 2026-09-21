import { OvertakeIndicator } from '@/registry/boxbox/ui/overtake-indicator';
import type { ControlValues } from '../types';
import controls from './controls';

export default function OvertakeIndicatorDemo({
  mode,
  state,
  label,
  size,
}: ControlValues<typeof controls.fields>) {
  return (
    <OvertakeIndicator
      mode={mode}
      state={state}
      label={label === '' ? undefined : label}
      size={size}
    />
  );
}
