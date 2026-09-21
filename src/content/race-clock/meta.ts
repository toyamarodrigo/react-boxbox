import type { ComponentMeta } from '../types';

const meta = {
  slug: 'race-clock',
  name: 'Race Clock',
  category: 'race-control',
  description:
    'A broadcast race clock that reads time remaining or elapsed as H:MM:SS. The parent owns the time.',
  registryName: 'race-clock',
  dependencies: [],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
