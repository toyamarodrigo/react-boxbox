import type { ComponentMeta } from '../types';

const meta = {
  slug: 'flag-banner',
  name: 'Flag Banner',
  category: 'race-control',
  description:
    'A full-width race control banner that wipes in with the track status, the sector it applies to, and an optional message.',
  registryName: 'flag-banner',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
