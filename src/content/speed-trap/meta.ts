import type { ComponentMeta } from '../types';

const meta = {
  slug: 'speed-trap',
  name: 'Speed Trap',
  category: 'broadcast',
  description:
    "One car's speed trap reading in big figures, with the best of the session under it and a flash on the lap the record changes hands.",
  registryName: 'speed-trap',
  dependencies: ['motion'],
  status: 'stable',
  notes: [
    'Fed by the invented race simulator on this page. The Replay page runs on lap-time data, which carries no speed, so this item never appears there.',
    'The figures roll with the shared Rolling Number, upward for a faster reading and downward for a slower one, and a reading that is the session best flashes once in its own presence boundary. Under reduced motion the flash collapses to the colour change and the digits do not roll.',
    'The card is a plain region, not a live one: the trap fires for every car on every lap, and announcing that would talk over the rest of the page. A page that wants the record spoken should own that announcement itself.',
  ],
} satisfies ComponentMeta;

export default meta;
