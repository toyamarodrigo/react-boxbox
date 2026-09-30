import { defineControls } from '../types';

const controls = defineControls({
  pair: {
    kind: 'select',
    label: 'Cars',
    description: 'The two cars in the battle, the one ahead at the start first.',
    default: 'TRE-NVA',
    options: ['TRE-NVA', 'EVO-MSO', 'AQU-SDA'],
  },
  position: {
    kind: 'number',
    label: 'Position',
    description: 'The place the two are fighting over.',
    default: 3,
    min: 1,
    max: 19,
    step: 1,
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'How big the card is.',
    default: 'md',
    options: ['md', 'sm'],
  },
  playback: {
    kind: 'select',
    label: 'Playback',
    description: 'How fast the laps go by.',
    default: '2x',
    options: ['1x', '2x', '4x'],
  },
});

export default controls;
