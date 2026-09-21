import { defineControls } from '../types';

const controls = defineControls({
  status: {
    kind: 'select',
    label: 'Status',
    description: 'Track status the banner announces.',
    default: 'yellow',
    options: ['green', 'yellow', 'double-yellow', 'red', 'sc', 'vsc', 'chequered'],
  },
  sector: {
    kind: 'number',
    label: 'Sector',
    description: 'Sector the flag applies to. Zero means the whole track.',
    default: 2,
    min: 0,
    max: 3,
    step: 1,
  },
  message: {
    kind: 'text',
    label: 'Message',
    description: 'Secondary line from race control.',
    default: 'Debris on the racing line',
  },
  visible: {
    kind: 'boolean',
    label: 'Visible',
    description: 'Wipe the banner in or out.',
    default: true,
  },
  align: {
    kind: 'select',
    label: 'Align',
    description: 'Edge the banner wipes from.',
    default: 'left',
    options: ['left', 'center'],
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Height and type scale of the bar.',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
});

export default controls;
