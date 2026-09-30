import { defineControls } from '../types';

const controls = defineControls({
  table: {
    kind: 'select',
    label: 'Table',
    description: 'Drivers, or teams scoring what their cars do.',
    default: 'drivers',
    options: ['drivers', 'teams'],
  },
  maxRows: {
    kind: 'number',
    label: 'Max rows',
    description: 'How many rows to show from the top.',
    default: 10,
    min: 3,
    max: 20,
    step: 1,
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'How big the rows are.',
    default: 'md',
    options: ['md', 'sm'],
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
