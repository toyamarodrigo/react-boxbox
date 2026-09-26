import { resolveBundle, themeCss } from './registry-bundle';
import type { RegistryBundle, RegistryItem } from './registry-bundle';

/**
 * The built registry, inlined at build time. `/public/r/*.json` is a
 * root-relative filesystem path here, not a public URL, so the JSON is bundled
 * into the page rather than fetched — the component route stays prerenderable.
 */
const modules = import.meta.glob('/public/r/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function isRegistryItem(value: unknown): value is RegistryItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<RegistryItem>;
  return typeof item.name === 'string' && typeof item.type === 'string';
}

/** `public/r/registry.json` is the index, not an item, and drops out here. */
export const registryItems = new Map<string, RegistryItem>(
  Object.values(modules)
    .filter(isRegistryItem)
    .map((item) => [item.name, item]),
);

export type ManualBundle = RegistryBundle & { themeCss: string };

export function manualBundle(name: string): ManualBundle {
  const bundle = resolveBundle(name, registryItems);
  const theme = bundle.themeItems.map((item) => registryItems.get(item)).find(Boolean);
  return { ...bundle, themeCss: themeCss(theme, bundle.files) };
}
