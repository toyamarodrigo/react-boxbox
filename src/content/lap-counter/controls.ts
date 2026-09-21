import { defineControls } from '../types';

const controls = defineControls({
  lap: {
    kind: 'number',
    label: 'Lap',
    description: 'The lap the race is on.',
    default: 12,
    min: 0,
    max: 99,
    step: 1,
  },
  totalLaps: {
    kind: 'number',
    label: 'Total laps',
    description: 'Laps in the race. The counter reads FINAL LAP once the lap reaches it.',
    default: 57,
    min: 1,
    max: 99,
    step: 1,
  },
  label: {
    kind: 'text',
    label: 'Label',
    description: 'The word beside the numbers.',
    default: 'LAP',
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Counter size.',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
});

export default controls;
