import type { ComponentMeta } from '../types';

const meta = {
  slug: 'overtake-indicator',
  name: 'Overtake Indicator',
  category: 'timing',
  description:
    'The badge that says a car can attack: DRS as it ran from 2011 to 2025, or Overtake Mode as the 2026 rules name it.',
  registryName: 'overtake-indicator',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
