import { CIRCUITS } from '@/data/circuits';
import { defineControls } from '../types';
import { FICTIONAL_CIRCUIT } from './circuit';

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

/** Circuits are picked by their location, the way a calendar names a round. */
export const circuitOptions = [
  FICTIONAL_CIRCUIT.name,
  ...CIRCUITS.map((circuit) => circuit.location),
] as [string, ...string[]];

const controls = defineControls({
  circuit: {
    kind: 'select',
    label: 'Circuit',
    description: 'The 2026 calendar, from public GeoJSON outlines, plus the invented Aster Park.',
    default: 'Silverstone',
    options: circuitOptions,
  },
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
    default: 'green',
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
  secondCar: {
    kind: 'boolean',
    label: 'Second car',
    description: 'Give the car behind the emphasised one a lesser emphasis.',
    default: false,
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
