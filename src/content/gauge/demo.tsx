import { Gauge } from '@/registry/boxbox/ui/gauge';
import type { ControlValues } from '../types';
import controls from './controls';
import { useEngine } from './use-engine';

export default function GaugeDemo({
  size,
  showValue,
  redline,
  running,
  tickMs,
}: ControlValues<typeof controls.fields>) {
  const { rpm, gear, throttle } = useEngine({ intervalMs: tickMs, running });

  return (
    <div className="flex flex-col items-center gap-3">
      <Gauge value={rpm} gear={gear} redline={redline} size={size} showValue={showValue} />
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {throttle === 0 ? 'off throttle' : 'on the power'}
      </p>
    </div>
  );
}
