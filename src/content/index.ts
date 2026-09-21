import type { ComponentMeta } from './types';
import example from './example/meta';
import tyreBadge from './tyre-badge/meta';
import sectorTimes from './sector-times/meta';
import driverNamePlate from './driver-name-plate/meta';
import startLights from './start-lights/meta';
import timingTower from './timing-tower/meta';
import replayBumper from './replay-bumper/meta';
import lapCounter from './lap-counter/meta';
import raceClock from './race-clock/meta';
import flagBanner from './flag-banner/meta';

export const manifest: readonly ComponentMeta[] = [
  example,
  tyreBadge,
  sectorTimes,
  driverNamePlate,
  startLights,
  timingTower,
  replayBumper,
  lapCounter,
  raceClock,
  flagBanner,
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
  'start-lights': {
    controls: () => import('./start-lights/controls'),
    demo: () => import('./start-lights/demo'),
    source: () => import('./start-lights/demo.tsx?raw'),
  },
  'timing-tower': {
    controls: () => import('./timing-tower/controls'),
    demo: () => import('./timing-tower/demo'),
    source: () => import('./timing-tower/demo.tsx?raw'),
  },
  'replay-bumper': {
    controls: () => import('./replay-bumper/controls'),
    demo: () => import('./replay-bumper/demo'),
    source: () => import('./replay-bumper/demo.tsx?raw'),
  },
  'lap-counter': {
    controls: () => import('./lap-counter/controls'),
    demo: () => import('./lap-counter/demo'),
    source: () => import('./lap-counter/demo.tsx?raw'),
  },
  'race-clock': {
    controls: () => import('./race-clock/controls'),
    demo: () => import('./race-clock/demo'),
    source: () => import('./race-clock/demo.tsx?raw'),
  },
  'flag-banner': {
    controls: () => import('./flag-banner/controls'),
    demo: () => import('./flag-banner/demo'),
    source: () => import('./flag-banner/demo.tsx?raw'),
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
