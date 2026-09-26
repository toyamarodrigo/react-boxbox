import { defineControls } from '../types';

const controls = defineControls({
  source: {
    kind: 'select',
    label: 'Source',
    description:
      'Audio plays the synthesised clip through an analyser; envelope runs precomputed levels with no sound.',
    default: 'audio',
    options: ['audio', 'envelope'],
  },
  from: {
    kind: 'text',
    label: 'From',
    description: 'Who is speaking, as printed on the sub line.',
    default: 'RACE ENGINEER',
  },
  to: {
    kind: 'select',
    label: 'To',
    description: 'The car the message is for.',
    default: 'EVO',
    options: ['EVO', 'MSO', 'TRE', 'NVA', 'AQU', 'SDA'],
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'How big the card is.',
    default: 'md',
    options: ['md', 'sm'],
  },
});

export default controls;
