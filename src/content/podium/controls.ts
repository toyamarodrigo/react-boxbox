import { defineControls } from '../types';

const controls = defineControls({
  visible: {
    kind: 'boolean',
    label: 'Visible',
    description: 'Raise the podium. The steps rise third, second, first.',
    default: true,
  },
  size: {
    kind: 'select',
    label: 'Size',
    description: 'Height of the steps and the type scale.',
    default: 'md',
    options: ['sm', 'md', 'lg'],
  },
  showDetail: {
    kind: 'boolean',
    label: 'Show detail',
    description: 'Add the race time under the winner and the gap under the other two.',
    default: true,
  },
});

export default controls;
