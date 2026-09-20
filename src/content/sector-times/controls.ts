import { defineControls } from '../types';

const statusOptions = ['fastest', 'personal', 'slower', 'unset'] as const;

const controls = defineControls({
  layout: {
    kind: 'select',
    label: 'Layout',
    description: 'Bars side by side, or one row per sector.',
    default: 'row',
    options: ['row', 'stack'],
  },
  miniSectors: {
    kind: 'number',
    label: 'Mini sectors',
    description: 'Segments per sector bar.',
    default: 1,
    min: 1,
    max: 6,
    step: 1,
  },
  countUp: {
    kind: 'boolean',
    label: 'Count up',
    description: 'Animate the lap time to its new value.',
    default: true,
  },
  live: {
    kind: 'boolean',
    label: 'Live',
    description: 'Drive the sectors from the race simulator',
    default: true,
  },
  s1Status: { kind: 'select', label: 'S1 status', default: 'personal', options: statusOptions },
  s2Status: { kind: 'select', label: 'S2 status', default: 'fastest', options: statusOptions },
  s3Status: { kind: 'select', label: 'S3 status', default: 'slower', options: statusOptions },
});

export default controls;
