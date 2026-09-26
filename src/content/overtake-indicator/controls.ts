import { defineControls } from '../types';

const controls = defineControls({
  mode: {
    kind: 'select',
    label: 'Mode',
    description: 'DRS up to 2025, Overtake Mode from 2026.',
    default: 'drs',
    options: ['drs', 'overtake'],
  },
  state: {
    kind: 'select',
    label: 'State',
    description: 'Off, in range, or deployed.',
    default: 'active',
    options: ['off', 'available', 'active'],
  },
  label: {
    kind: 'text',
    label: 'Label',
    description: 'Text on the badge. Empty keeps the default for the mode.',
    default: '',
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Type scale of the badge. Small matches a timing tower tag.',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
});

export default controls;
