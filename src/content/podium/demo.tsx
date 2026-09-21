import { useMemo } from 'react';
import { grid } from '@/data/grid';
import { Podium, type PodiumSteps } from '@/registry/boxbox/ui/podium';
import type { ControlValues } from '../types';
import controls from './controls';

const DETAILS = ['1:32:04.117', '+4.512', '+11.986'] as const;

function entry(index: number, detail?: string) {
  const driver = grid.drivers[index]!;
  const team = grid.teams.find((item) => item.id === driver.teamId)!;
  return { driver, team, detail };
}

export default function PodiumDemo({
  visible,
  size,
  showDetail,
}: ControlValues<typeof controls.fields>) {
  const steps = useMemo<PodiumSteps>(
    () => [
      entry(0, showDetail ? DETAILS[0] : undefined),
      entry(3, showDetail ? DETAILS[1] : undefined),
      entry(6, showDetail ? DETAILS[2] : undefined),
    ],
    [showDetail],
  );

  return <Podium steps={steps} visible={visible} size={size} />;
}
