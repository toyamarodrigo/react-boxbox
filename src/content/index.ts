import type { ComponentMeta } from './types';
import example from './example/meta';

export const manifest: readonly ComponentMeta[] = [example];
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
