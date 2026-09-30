import type { ComponentMeta } from '../types';

const meta = {
  slug: 'battle-card',
  name: 'Battle Card',
  category: 'broadcast',
  description:
    'Two cars one place apart on a broadcast card: the interval between them, which way it is going, and a tag when one gets past.',
  registryName: 'battle-card',
  dependencies: ['motion'],
  status: 'stable',
  notes: [
    'The card is data only and does not decide what a battle is. The Replay page calls it one when the interval at the line is 1.0 s or less on two laps in a row, and ends it past 1.5 s, under a neutralisation, or when either car stops; the demo on this page runs one on the fictional grid.',
    '`trend` is the change of the interval per lap in seconds: negative while the car behind closes, positive while the car ahead pulls away, shown as `−0.3 s/lap`. Leave it out when there are no laps to measure it over, for example on the lap after a pass.',
    'When the two cars swap, pass them the other way round: the plates trade places with a spring and the positions stay where they are. `overtake` tags the card `OVERTAKE`; how long it stays is up to you (the Replay page keeps it for one lap).',
    'The card wipes in when it mounts, so key it per battle; inside an `AnimatePresence` it wipes out on removal. Under reduced motion it appears, swaps and goes with no motion.',
    'Everything painted is hidden from assistive technology behind one sentence of real text that says closing or pulling away in words. The card is not a live region: the interval changes every second.',
  ],
} satisfies ComponentMeta;

export default meta;
