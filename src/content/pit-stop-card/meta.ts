import type { ComponentMeta } from '../types';

const meta = {
  slug: 'pit-stop-card',
  name: 'Pit Stop Card',
  category: 'pit-lane',
  description:
    'One pit stop on a broadcast card: which stop, the tyres off and on, the pit lane time and the position in and out.',
  registryName: 'pit-stop-card',
  dependencies: ['motion'],
  status: 'stable',
  notes: [
    'The time on the card is the pit lane time, from pit entry to pit exit, which is what timing feeds publish. It is not the stationary time at the box, and the card never calls it that.',
    'The card has no clock of its own. To show a stop running, pass the lane time so far and leave `positionOut` out until the car leaves, then pass the final time and the position. The demo on this page does that on the fictional grid; the Replay page does it for the followed driver, and keeps the card up for a moment after the exit.',
    'The tyre pair shows only when both compounds are known. Older races carry no compounds at all, and half a change would be a guess.',
    'The card wipes in when it mounts, so mount it when the car enters the lane; inside an `AnimatePresence` it wipes out on removal. Under reduced motion it appears and goes with no wipe, and the position out appears without its slide.',
    'Everything painted is hidden from assistive technology behind one sentence of real text. The card is not a live region: the lane time changes many times a second.',
  ],
} satisfies ComponentMeta;

export default meta;
