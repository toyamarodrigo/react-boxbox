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
  showWear: {
    kind: 'boolean',
    label: 'Wear ring',
    description: 'Draw the wear arc. Off is the plain badge, as when `wear` is left out.',
    default: true,
  },
  wear: {
    kind: 'number',
    label: 'Wear',
    description: 'Percentage of tyre life used. The arc fills clockwise from 12 o’clock.',
    default: 35,
    min: 0,
    max: 100,
    step: 1,
  },
  wearWarning: {
    kind: 'number',
    label: 'Wear warning',
    description: 'Wear percentage at which the arc turns to the destructive colour.',
    default: 70,
    min: 0,
    max: 100,
    step: 1,
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
