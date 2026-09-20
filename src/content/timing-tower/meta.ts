import type { ComponentMeta } from '../types';

const meta = {
  slug: 'timing-tower',
  name: 'Timing Tower',
  category: 'timing',
  description:
    'The running order of the whole field, with rows that slide as positions change and a value column that switches between gap, interval, and last lap time.',
  registryName: 'timing-tower',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
