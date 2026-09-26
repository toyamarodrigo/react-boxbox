import { defineControls } from '../types';

const controls = defineControls({
  totalLaps: {
    kind: 'number',
    label: 'Total laps',
    description: 'The race distance, which is the whole width of the bar.',
    default: 57,
    min: 10,
    max: 80,
    step: 1,
  },
  showCurrentLap: {
    kind: 'boolean',
    label: 'Fill to the current lap',
    description: 'Off shows the whole strategy at once, as a finished race would.',
    default: true,
  },
  animate: {
    kind: 'boolean',
    label: 'Run the race',
    description: 'Advance the lap on a timer. Off holds the lap below.',
    default: true,
  },
  currentLap: {
    kind: 'number',
    label: 'Current lap',
    description: 'The lap the cars are on while the race is not running.',
    default: 24,
    min: 0,
    max: 80,
    step: 1,
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Bar height. The small one never shows compound letters.',
    default: 'md',
    options: ['md', 'sm'],
  },
});

export default controls;
