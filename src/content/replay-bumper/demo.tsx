import { useState } from 'react';
import { ReplayBumper } from '@/registry/boxbox/ui/replay-bumper';
import type { ControlValues } from '../types';
import type controls from './controls';

export default function ReplayBumperDemo({
  variant,
  label,
  duration,
  color,
}: ControlValues<typeof controls.fields>) {
  const [play, setPlay] = useState(false);
  const [replay, setReplay] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      <ReplayBumper
        play={play}
        label={label}
        duration={duration}
        variant={variant}
        color={color}
        onMidpoint={() => setReplay((current) => !current)}
        onComplete={() => setPlay(false)}
        className="h-48 w-80 overflow-hidden border border-border bg-card text-card-foreground"
      >
        <div className="flex h-full flex-col justify-between p-4">
          <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span>CAM 04</span>
            <span>{replay ? '-00:12.480' : '01:24:51.702'}</span>
          </div>
          <div className="font-display text-4xl font-black uppercase italic tracking-tight">
            {replay ? 'REPLAY' : 'LIVE'}
          </div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {replay ? 'turn 4 · lap 28' : 'turn 9 · lap 29'}
          </div>
        </div>
      </ReplayBumper>
      <button
        type="button"
        onClick={() => setPlay(true)}
        className="border border-border bg-muted px-4 py-2 font-display text-sm font-bold uppercase tracking-widest text-foreground"
      >
        Play
      </button>
    </div>
  );
}
