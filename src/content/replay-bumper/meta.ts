import type { ComponentMeta } from '../types';

const meta = {
  slug: 'replay-bumper',
  name: 'Replay Bumper',
  category: 'broadcast',
  description:
    'A broadcast transition that sweeps over a panel so its content can change behind it.',
  registryName: 'replay-bumper',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
