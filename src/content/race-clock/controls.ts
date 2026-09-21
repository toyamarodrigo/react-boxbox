import { defineControls } from '../types';

const controls = defineControls({
  seconds: {
    kind: 'number',
    label: 'Seconds',
    description: 'Time on the clock, in seconds. The component itself takes milliseconds.',
    default: 3723,
    min: 0,
    max: 7200,
    step: 1,
  },
  direction: {
    kind: 'select',
    label: 'Direction',
    description: 'Whether the figure is time remaining or time elapsed.',
    default: 'down',
    options: ['down', 'up'],
  },
  showHours: {
    kind: 'boolean',
    label: 'Show hours',
    description: 'Show H:MM:SS instead of MM:SS.',
    default: true,
  },
  label: {
    kind: 'text',
    label: 'Label',
    description: 'Optional word beside the clock.',
    default: 'RACE',
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Clock size.',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
});

export default controls;
