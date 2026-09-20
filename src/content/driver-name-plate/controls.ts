import { drivers } from '@/data/grid';
import { defineControls } from '../types';

const driverCodes = drivers.map((driver) => driver.code) as [string, ...string[]];

const controls = defineControls({
  driver: {
    kind: 'select',
    label: 'Driver',
    description: 'Three-letter code of the driver on the plate.',
    default: driverCodes[0],
    options: driverCodes,
  },
  position: {
    kind: 'number',
    label: 'Position',
    description: 'Running order shown in the position box.',
    default: 1,
    min: 1,
    max: 20,
    step: 1,
  },
  variant: {
    kind: 'select',
    label: 'Variant',
    description: 'Compact shows the code only, full shows the whole name.',
    default: 'full',
    options: ['full', 'compact'],
  },
  status: {
    kind: 'select',
    label: 'Status',
    description: 'Tag at the end of the plate.',
    default: 'none',
    options: ['none', 'pit', 'lapped', 'fastest', 'out'],
  },
  visible: {
    kind: 'boolean',
    label: 'Visible',
    description: 'Wipe the plate in or out.',
    default: true,
  },
  align: {
    kind: 'select',
    label: 'Align',
    description: 'Edge the plate wipes from.',
    default: 'left',
    options: ['left', 'right'],
  },
});

export default controls;
