import { defineControls } from '../types';

const controls = defineControls({
  totalLaps: {
    kind: 'number',
    label: 'Total laps',
    description: 'The race distance, which is the whole width of the chart.',
    default: 44,
    min: 10,
    max: 70,
    step: 1,
  },
  animate: {
    kind: 'boolean',
    label: 'Run the race',
    description: 'Advance the lap on a timer, so the lines grow with the clock.',
    default: true,
  },
  currentLap: {
    kind: 'number',
    label: 'Current lap',
    description: 'The lap the field is on while the race is not running.',
    default: 22,
    min: 0,
    max: 70,
    step: 1,
  },
  emphasised: {
    kind: 'select',
    label: 'Follow',
    description: 'The car drawn in its own colour, over the rest of the field.',
    default: 'TRE',
    options: ['none', 'EVO', 'MSO', 'TRE', 'NVA', 'AQU', 'SDA'],
  },
});

export default controls;
