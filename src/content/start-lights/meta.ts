import type { ComponentMeta } from '../types';

const meta = {
  slug: 'start-lights',
  name: 'Start Lights',
  category: 'race-control',
  description:
    'A five-column race-start gantry that arms light by light, holds, and then goes out — or flashes yellow when the start is aborted.',
  registryName: 'start-lights',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
