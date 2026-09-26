import { useState } from 'react';
import { TeamRadio } from '@/registry/boxbox/ui/team-radio';
import type { ControlValues } from '../types';
import type controls from './controls';
import {
  TEAM_RADIO_ENVELOPE,
  TEAM_RADIO_ENVELOPE_RATE,
  TEAM_RADIO_SRC,
  TEAM_RADIO_WORDS,
} from './radio';

export default function TeamRadioDemo({
  source,
  from,
  to,
  size,
}: ControlValues<typeof controls.fields>) {
  const [play, setPlay] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      {source === 'audio' ? (
        <TeamRadio
          key="audio"
          from={from}
          to={to}
          words={TEAM_RADIO_WORDS}
          src={TEAM_RADIO_SRC}
          size={size}
        />
      ) : (
        <>
          <TeamRadio
            key="envelope"
            from={from}
            to={to}
            words={TEAM_RADIO_WORDS}
            envelope={TEAM_RADIO_ENVELOPE}
            envelopeRate={TEAM_RADIO_ENVELOPE_RATE}
            play={play}
            onComplete={() => setPlay(false)}
            size={size}
          />
          <button
            type="button"
            onClick={() => setPlay(true)}
            className="border border-border bg-muted px-4 py-2 font-display text-sm font-bold uppercase tracking-widest text-foreground"
          >
            Play
          </button>
        </>
      )}
    </div>
  );
}
