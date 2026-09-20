import type { ComponentMeta } from '../types';

const meta = {
  slug: 'driver-name-plate',
  name: 'Driver Name Plate',
  category: 'broadcast',
  description:
    'A broadcast lower third that wipes in with the driver position, team colour, name, car number, and race status.',
  registryName: 'driver-name-plate',
  dependencies: ['motion'],
  status: 'stable',
} satisfies ComponentMeta;

export default meta;
