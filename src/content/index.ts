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
import overtakeIndicator from './overtake-indicator/meta';
import podium from './podium/meta';
import trackMap from './track-map/meta';
import stintBar from './stint-bar/meta';
import gapChart from './gap-chart/meta';
import speedTrap from './speed-trap/meta';
import gauge from './gauge/meta';
import teamRadio from './team-radio/meta';

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
  overtakeIndicator,
  podium,
  trackMap,
  stintBar,
  gapChart,
  speedTrap,
  gauge,
  teamRadio,
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
  },
  'tyre-badge': {
    controls: () => import('./tyre-badge/controls'),
    demo: () => import('./tyre-badge/demo'),
  },
  'sector-times': {
    controls: () => import('./sector-times/controls'),
    demo: () => import('./sector-times/demo'),
  },
  'driver-name-plate': {
    controls: () => import('./driver-name-plate/controls'),
    demo: () => import('./driver-name-plate/demo'),
  },
  'start-lights': {
    controls: () => import('./start-lights/controls'),
    demo: () => import('./start-lights/demo'),
  },
  'timing-tower': {
    controls: () => import('./timing-tower/controls'),
    demo: () => import('./timing-tower/demo'),
  },
  'replay-bumper': {
    controls: () => import('./replay-bumper/controls'),
    demo: () => import('./replay-bumper/demo'),
  },
  'lap-counter': {
    controls: () => import('./lap-counter/controls'),
    demo: () => import('./lap-counter/demo'),
  },
  'race-clock': {
    controls: () => import('./race-clock/controls'),
    demo: () => import('./race-clock/demo'),
  },
  'flag-banner': {
    controls: () => import('./flag-banner/controls'),
    demo: () => import('./flag-banner/demo'),
  },
  'overtake-indicator': {
    controls: () => import('./overtake-indicator/controls'),
    demo: () => import('./overtake-indicator/demo'),
  },
  podium: {
    controls: () => import('./podium/controls'),
    demo: () => import('./podium/demo'),
  },
  'track-map': {
    controls: () => import('./track-map/controls'),
    demo: () => import('./track-map/demo'),
  },
  'stint-bar': {
    controls: () => import('./stint-bar/controls'),
    demo: () => import('./stint-bar/demo'),
  },
  'gap-chart': {
    controls: () => import('./gap-chart/controls'),
    demo: () => import('./gap-chart/demo'),
  },
  'speed-trap': {
    controls: () => import('./speed-trap/controls'),
    demo: () => import('./speed-trap/demo'),
  },
  gauge: {
    controls: () => import('./gauge/controls'),
    demo: () => import('./gauge/demo'),
  },
  'team-radio': {
    controls: () => import('./team-radio/controls'),
    demo: () => import('./team-radio/demo'),
  },
} satisfies Record<
  string,
  {
    controls: () => Promise<{ default: unknown }>;
    demo: () => Promise<{ default: unknown }>;
  }
>;

export function getModules(slug: string) {
  return contentModules[slug as keyof typeof contentModules];
}
