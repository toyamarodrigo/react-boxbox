import { defineControls } from '../types';

const controls = defineControls({
  active: { kind: 'boolean', label: 'Active', description: 'Show the live state.', default: true },
  level: {
    kind: 'number',
    label: 'Level',
    description: 'Signal strength.',
    default: 4,
    min: 0,
    max: 10,
    step: 1,
  },
  mode: {
    kind: 'select',
    label: 'Mode',
    default: 'race',
    options: ['race', 'practice', 'qualifying'],
  },
  color: { kind: 'color', label: 'Accent', default: '#dc2626' },
  label: { kind: 'text', label: 'Label', default: 'BOXBOX' },
});

export default controls;
