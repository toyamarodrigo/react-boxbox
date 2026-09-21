import type { ComponentMeta } from '../types';

const meta = {
  slug: 'podium',
  name: 'Podium',
  category: 'broadcast',
  description:
    'The top three at the end of the race, laid out second, first, third, with the steps rising last place first.',
  registryName: 'podium',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
