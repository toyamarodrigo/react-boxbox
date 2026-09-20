import { defineControls } from '../types';

const controls = defineControls({
  autoStart: {
    kind: 'boolean',
    label: 'Auto start',
    description: 'Arm the gantry as soon as it mounts.',
    default: true,
  },
  interval: {
    kind: 'number',
    label: 'Interval',
    description: 'Milliseconds between each column lighting up.',
    default: 1000,
    min: 300,
    max: 2000,
    step: 100,
  },
  holdMin: {
    kind: 'number',
    label: 'Hold minimum',
    description: 'Shortest random hold, in milliseconds, before lights out.',
    default: 200,
    min: 0,
    max: 5000,
    step: 100,
  },
  holdMax: {
    kind: 'number',
    label: 'Hold maximum',
    description: 'Longest random hold, in milliseconds, before lights out.',
    default: 3000,
    min: 0,
    max: 5000,
    step: 100,
  },
  size: {
    kind: 'select',
    label: 'Size',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
});

export default controls;
