import { useState } from 'react';
import {
  StartLights,
  startLightsInitialState,
  startLightsReducer,
} from '../../../registry/boxbox/ui/start-lights';
import type { StartLightsAction, StartLightsState } from '../../../registry/boxbox/ui/start-lights';
import type { ControlValues } from '../types';
import controls from './controls';

const buttonClass =
  'border border-border bg-card px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-card-foreground transition-colors hover:bg-muted';

export default function StartLightsDemo({
  autoStart,
  interval,
  holdMin,
  holdMax,
  size,
}: ControlValues<typeof controls.fields>) {
  const [state, setState] = useState<StartLightsState>(startLightsInitialState);
  const send = (action: StartLightsAction) =>
    setState((current) => startLightsReducer(current, action));

  return (
    <div className="flex flex-col items-center gap-6">
      <StartLights
        autoStart={autoStart}
        interval={interval}
        holdRange={[Math.min(holdMin, holdMax), Math.max(holdMin, holdMax)]}
        size={size}
        state={state}
        onStateChange={setState}
      />
      <div className="flex gap-2">
        <button type="button" className={buttonClass} onClick={() => send({ type: 'start' })}>
          Start
        </button>
        <button type="button" className={buttonClass} onClick={() => send({ type: 'abort' })}>
          Abort
        </button>
        <button type="button" className={buttonClass} onClick={() => send({ type: 'reset' })}>
          Reset
        </button>
      </div>
    </div>
  );
}
