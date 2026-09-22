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
  notes: [
    'A row with a `finishStatus` other than `finished` stays listed while the race runs: it reads `OUT`, muted and faded, with no tags. In `results` mode the same row reads its finish status.',
  ],
} satisfies ComponentMeta;

export default meta;
