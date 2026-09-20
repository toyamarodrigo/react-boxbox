import { defineControls } from '../types';

const controls = defineControls({
  compound: {
    kind: 'select',
    label: 'Compound',
    description: 'Tyre compound: soft, medium, hard, intermediate, or wet.',
    default: 'S',
    options: ['S', 'M', 'H', 'I', 'W'],
  },
  age: {
    kind: 'number',
    label: 'Age',
    description: 'Laps completed on this set.',
    default: 12,
    min: 0,
    max: 60,
    step: 1,
  },
  isNew: {
    kind: 'boolean',
    label: 'New set',
    description: 'Show NEW instead of the lap count.',
    default: false,
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Badge size.',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
});

export default controls;
