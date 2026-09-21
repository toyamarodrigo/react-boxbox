import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';
import type { ControlValues } from '../types';
import controls from './controls';

export default function TyreBadgeDemo({
  compound,
  age,
  isNew,
  showWear,
  wear,
  wearWarning,
  size,
}: ControlValues<typeof controls.fields>) {
  return (
    <TyreBadge
      compound={compound}
      age={age}
      isNew={isNew}
      size={size}
      wear={showWear ? wear : undefined}
      wearWarning={wearWarning}
    />
  );
}
