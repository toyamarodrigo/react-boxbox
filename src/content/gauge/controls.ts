import { defineControls } from '../types';

const controls = defineControls({
  size: {
    kind: 'select',
    label: 'Size',
    description: 'How big the dial is.',
    default: 'md',
    options: ['md', 'sm', 'lg'],
  },
  showValue: {
    kind: 'boolean',
    label: 'Show the revolutions',
    description: 'Adds the rpm figure under the gear.',
    default: true,
  },
  redline: {
    kind: 'number',
    label: 'Redline',
    description: 'The revolutions the arc turns red at.',
    default: 12000,
    min: 8000,
    max: 15000,
    step: 500,
  },
  running: {
    kind: 'boolean',
    label: 'Run the engine',
    description: 'Off holds the last reading, so the dial can be looked at still.',
    default: true,
  },
  tickMs: {
    kind: 'number',
    label: 'Speed',
    description: 'Engine tick in ms. Fifty is the twenty readings a second the model runs at.',
    default: 50,
    min: 20,
    max: 400,
    step: 10,
  },
});

export default controls;
