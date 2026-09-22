import { defineControls } from '../types';

const controls = defineControls({
  code: {
    kind: 'select',
    label: 'Car',
    description: 'The car the trap reading is shown for.',
    default: 'EVO',
    options: ['EVO', 'MSO', 'TRE', 'NVA', 'AQU', 'SDA'],
  },
  unit: {
    kind: 'select',
    label: 'Unit',
    description: 'Readings are given in km/h; mph converts them.',
    default: 'kph',
    options: ['kph', 'mph'],
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'How big the figure is.',
    default: 'md',
    options: ['md', 'lg'],
  },
  showBest: {
    kind: 'boolean',
    label: 'Show the session best',
    description: 'Off drops the line under the figure, for a card that only reports one car.',
    default: true,
  },
  speed: {
    kind: 'number',
    label: 'Speed',
    description: 'Simulator tick in ms',
    default: 1500,
    min: 500,
    max: 3000,
    step: 250,
  },
});

export default controls;
