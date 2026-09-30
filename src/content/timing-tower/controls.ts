import { defineControls } from '../types';

const controls = defineControls({
  mode: {
    kind: 'select',
    label: 'Mode',
    description:
      'Value column: gap to the leader, interval to the car ahead, last lap time, or the classification once the race is over.',
    default: 'leader',
    options: ['leader', 'interval', 'lapTime', 'results'],
  },
  maxRows: {
    kind: 'number',
    label: 'Max rows',
    description: 'How many positions to show.',
    default: 10,
    min: 3,
    max: 20,
    step: 1,
  },
  highlightTop: {
    kind: 'number',
    label: 'Highlight top',
    description: 'Give the first N positions a subtle background.',
    default: 3,
    min: 0,
    max: 10,
    step: 1,
  },
  showTyre: {
    kind: 'boolean',
    label: 'Show tyre',
    description: 'Show the tyre compound and its age on each row.',
    default: true,
  },
  showOvertake: {
    kind: 'boolean',
    label: 'Show overtake',
    description: 'Show the overtake tag when a car is in range.',
    default: true,
  },
  overtakeMode: {
    kind: 'select',
    label: 'Overtake mode',
    description: 'DRS up to 2025, Overtake Mode from 2026.',
    default: 'drs',
    options: ['drs', 'overtake'],
  },
  positionsGained: {
    kind: 'boolean',
    label: 'Positions gained',
    description:
      'In results mode, give each row its places gained against the grid; the car at the back started from the pit lane.',
    default: true,
  },
  followable: {
    kind: 'boolean',
    label: 'Followable',
    description: 'Let a click on a row follow that driver and expand it.',
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
