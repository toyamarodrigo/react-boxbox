import { defineControls } from '../types';

const sectorOptions = [
  'none',
  'green',
  'yellow',
  'double-yellow',
  'red',
  'sc',
  'vsc',
  'chequered',
] as const;

const controls = defineControls({
  sector1: {
    kind: 'select',
    label: 'Sector 1',
    description: 'Flag over the first third of the lap.',
    default: 'green',
    options: sectorOptions,
  },
  sector2: {
    kind: 'select',
    label: 'Sector 2',
    description: 'Flag over the middle third of the lap.',
    default: 'yellow',
    options: sectorOptions,
  },
  sector3: {
    kind: 'select',
    label: 'Sector 3',
    description: 'Flag over the last third of the lap.',
    default: 'none',
    options: sectorOptions,
  },
  cars: {
    kind: 'number',
    label: 'Cars',
    description: 'How many markers to place on the track.',
    default: 6,
    min: 0,
    max: 20,
    step: 1,
  },
  showCodes: {
    kind: 'boolean',
    label: 'Show codes',
    description: 'Label each marker with its driver code.',
    default: true,
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Marker and label scale. The map always fills its container.',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
  animate: {
    kind: 'boolean',
    label: 'Animate',
    description: 'Send the cars round the lap.',
    default: true,
  },
});

export default controls;
