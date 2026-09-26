import { LapCounter } from '@/registry/boxbox/ui/lap-counter';
import type { ControlValues } from '../types';
import controls from './controls';

export default function LapCounterDemo({
  lap,
  totalLaps,
  label,
  size,
}: ControlValues<typeof controls.fields>) {
  return <LapCounter lap={lap} totalLaps={totalLaps} label={label} size={size} />;
}
