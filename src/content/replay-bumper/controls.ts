import { defineControls } from '../types';

const controls = defineControls({
  variant: {
    kind: 'select',
    label: 'Variant',
    description: 'Shape of the transition.',
    default: 'wipe',
    options: ['wipe', 'slide', 'flash'],
  },
  label: { kind: 'text', label: 'Label', description: 'Text on the bumper.', default: 'REPLAY' },
  duration: {
    kind: 'number',
    label: 'Duration',
    description: 'Length of one run, in milliseconds.',
    default: 1200,
    min: 600,
    max: 3000,
    step: 100,
  },
  color: { kind: 'color', label: 'Color', default: '#dc2626' },
});

export default controls;
