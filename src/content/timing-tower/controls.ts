import { defineControls } from '../types';

const controls = defineControls({
  mode: {
    kind: 'select',
    label: 'Mode',
    description: 'Value column: gap to the leader, interval to the car ahead, or last lap time.',
    default: 'leader',
    options: ['leader', 'interval', 'lapTime'],
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
  showDrs: {
    kind: 'boolean',
    label: 'Show DRS',
    description: 'Show the DRS tag when a car is in range.',
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
