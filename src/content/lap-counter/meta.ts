import type { ComponentMeta } from '../types';

const meta = {
  slug: 'lap-counter',
  name: 'Lap Counter',
  category: 'race-control',
  description:
    'A broadcast lap counter that rolls the lap as the race runs and calls the last lap the final lap.',
  registryName: 'lap-counter',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
