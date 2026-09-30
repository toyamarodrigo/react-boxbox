import { defineControls } from '../types';

const controls = defineControls({
  code: {
    kind: 'select',
    label: 'Car',
    description: 'The car that stops.',
    default: 'TRE',
    options: ['EVO', 'MSO', 'TRE', 'NVA', 'AQU', 'SDA'],
  },
  showTyres: {
    kind: 'boolean',
    label: 'Compounds known',
    description: 'Off leaves both compounds out, as in a race with no tyre data: the pair goes.',
    default: true,
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
    description: 'How fast the stop runs against real time.',
    default: '2x',
    options: ['1x', '2x', '4x'],
  },
});

export default controls;
