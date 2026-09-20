import type { ComponentMeta } from './types';
import example from './example/meta';
import tyreBadge from './tyre-badge/meta';
import sectorTimes from './sector-times/meta';
import driverNamePlate from './driver-name-plate/meta';
import timingTower from './timing-tower/meta';

export const manifest: readonly ComponentMeta[] = [
  example,
  tyreBadge,
  sectorTimes,
  driverNamePlate,
  timingTower,
];
export const categoryOrder = ['timing', 'broadcast', 'race-control', 'pit-lane'] as const;
export const categoryNames = {
  timing: 'Timing',
  broadcast: 'Broadcast',
  'race-control': 'Race Control',
  'pit-lane': 'Pit Lane',
} as const;

export function getBySlug(slug: string) {
  return manifest.find((item) => item.slug === slug);
}
export function visible() {
  return manifest.filter((item) => item.status !== 'hidden');
}
export function byCategory(category: ComponentMeta['category']) {
  return visible().filter((item) => item.category === category);
}

export const contentModules = {
  example: {
    controls: () => import('./example/controls'),
    demo: () => import('./example/demo'),
    source: () => import('./example/demo.tsx?raw'),
  },
  'tyre-badge': {
    controls: () => import('./tyre-badge/controls'),
    demo: () => import('./tyre-badge/demo'),
    source: () => import('./tyre-badge/demo.tsx?raw'),
  },
  'sector-times': {
    controls: () => import('./sector-times/controls'),
    demo: () => import('./sector-times/demo'),
    source: () => import('./sector-times/demo.tsx?raw'),
  },
  'driver-name-plate': {
    controls: () => import('./driver-name-plate/controls'),
    demo: () => import('./driver-name-plate/demo'),
    source: () => import('./driver-name-plate/demo.tsx?raw'),
  },
  'timing-tower': {
    controls: () => import('./timing-tower/controls'),
    demo: () => import('./timing-tower/demo'),
    source: () => import('./timing-tower/demo.tsx?raw'),
  },
} satisfies Record<
  string,
  {
    controls: () => Promise<{ default: unknown }>;
    demo: () => Promise<{ default: unknown }>;
    source: () => Promise<{ default: string }>;
  }
>;

export function getModules(slug: string) {
  return contentModules[slug as keyof typeof contentModules];
}
