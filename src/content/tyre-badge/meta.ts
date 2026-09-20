import type { ComponentMeta } from '../types';

const meta = {
  slug: 'tyre-badge',
  name: 'Tyre Badge',
  category: 'pit-lane',
  description:
    'A broadcast tyre marker that shows the compound and the laps on the current set, and rotates when the compound changes.',
  registryName: 'tyre-badge',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
