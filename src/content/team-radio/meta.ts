import type { ComponentMeta } from '../types';

const meta = {
  slug: 'team-radio',
  name: 'Team Radio',
  category: 'broadcast',
  description:
    'A radio message from the pit wall: who is talking to whom, a live trace of the audio and the transcript arriving word by word.',
  registryName: 'team-radio',
  dependencies: ['motion'],
  status: 'stable',
  notes: [
    'The clip on this page is synthesised for the project: no real recording, no real voice, and the names are the fictional grid. Real team radio is the broadcaster’s, so nothing of it is shipped here and the card never appears on the Replay page.',
    'Given `src`, the card owns a play/stop control and never plays on its own. On the first play it opens an `AudioContext`, wires the element through an `AnalyserNode`, and draws the real level each frame with the words timed from the audio clock. Given an `envelope` (levels 0–1 at `envelopeRate` samples per second) instead, a rising edge of `play` runs the message on the animation clock with no audio at all, and `onComplete` fires at its end.',
    'Serve `src` from the same origin, or from a host that sends CORS headers. Web Audio silences a cross-origin clip without them, so the message plays with no sound and a flat trace. A `key` change remounts the card for a new `src`.',
    'The trace is the `waveform` item: the base `Waveform` of ElevenLabs UI (MIT), trimmed to a canvas of level bars and installed alongside. It is hidden from assistive technology; the transcript is real text, read once, and the control has a plain name.',
    'The card wipes in when it mounts, so mount it when the message comes in. Under reduced motion there is no wipe, no pulse on the live dot and no pop on the words: they appear at their time.',
  ],
} satisfies ComponentMeta;

export default meta;
