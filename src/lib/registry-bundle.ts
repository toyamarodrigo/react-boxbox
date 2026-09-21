/**
 * Turns the built shadcn registry JSON in `public/r/` into everything a
 * copy-paste user needs: the component plus its transitive `@boxbox/*` items,
 * with imports rewritten exactly the way the CLI rewrites them on install.
 *
 * Site only. Nothing here ships inside a registry component.
 */

export type RegistryFile = {
  path: string;
  type: string;
  content?: string;
  target?: string;
};

export type RegistryCssVars = {
  theme?: Record<string, string>;
  light?: Record<string, string>;
  dark?: Record<string, string>;
};

export type RegistryItem = {
  name: string;
  type: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
  cssVars?: RegistryCssVars;
};

export type BundleFile = {
  /** Bare file name, used as the tab label. */
  name: string;
  /** Where the file goes in the consumer project, e.g. `components/ui/tyre-badge.tsx`. */
  targetPath: string;
  content: string;
};

export type RegistryBundle = {
  files: BundleFile[];
  npmDependencies: string[];
  /** Names of the `registry:theme` items the component pulls in. */
  themeItems: string[];
};

const NAMESPACE = '@boxbox/';

/** Items that contribute tokens or fonts rather than files to copy. */
const TOKEN_ONLY_TYPES = new Set(['registry:theme', 'registry:font']);

/**
 * The two rewrites the shadcn CLI applies to this registry. `@/lib/utils` is
 * left alone: shadcn already puts `cn` there.
 */
export function rewriteImports(content: string): string {
  return content
    .replaceAll('@/registry/boxbox/ui/', '@/components/ui/')
    .replaceAll('@/registry/boxbox/lib/', '@/lib/');
}

export function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** The built JSON may carry an explicit `target`; otherwise the type decides. */
export function targetPath(file: RegistryFile): string {
  if (file.target) return file.target.replace(/^(?:~\/|\.\/|\/)/, '');
  const name = fileName(file.path);
  return file.type === 'registry:lib' ? `lib/${name}` : `components/ui/${name}`;
}

/**
 * Resolves an item and its transitive `@boxbox/*` registry dependencies.
 * Post-order traversal puts every dependency ahead of its dependent; the
 * result is then stable-partitioned so libs come first, then ui items in
 * dependency order, and the requested component last.
 */
export function resolveBundle(name: string, items: Map<string, RegistryItem>): RegistryBundle {
  const visited = new Set<string>();
  const ordered: RegistryItem[] = [];

  function visit(itemName: string) {
    if (visited.has(itemName)) return;
    visited.add(itemName);
    const item = items.get(itemName);
    if (!item) return;
    for (const dependency of item.registryDependencies ?? []) {
      if (dependency.startsWith(NAMESPACE)) visit(dependency.slice(NAMESPACE.length));
    }
    ordered.push(item);
  }

  visit(name);

  const requested = ordered.at(-1);
  const dependencies = ordered.slice(0, -1);
  const sorted = [
    ...dependencies.filter((item) => item.type === 'registry:lib'),
    ...dependencies.filter((item) => item.type !== 'registry:lib'),
    ...(requested ? [requested] : []),
  ];

  const files: BundleFile[] = [];
  const npmDependencies: string[] = [];
  const themeItems: string[] = [];
  const seenTargets = new Set<string>();

  for (const item of sorted) {
    for (const dependency of item.dependencies ?? []) {
      if (!npmDependencies.includes(dependency)) npmDependencies.push(dependency);
    }
    if (item.type === 'registry:theme') themeItems.push(item.name);
    if (TOKEN_ONLY_TYPES.has(item.type)) continue;
    for (const file of item.files ?? []) {
      if (TOKEN_ONLY_TYPES.has(file.type) || file.content === undefined) continue;
      const target = targetPath(file);
      if (seenTargets.has(target)) continue;
      seenTargets.add(target);
      files.push({
        name: fileName(file.path),
        targetPath: target,
        content: rewriteImports(file.content),
      });
    }
  }

  return { files, npmDependencies, themeItems };
}

/** `var(--tyre-soft)` → `tyre-soft`. Anything else is left as-is. */
function variableName(value: string): string | undefined {
  return /^var\(--([\w-]+)\)$/.exec(value)?.[1];
}

function block(selector: string, entries: [string, string][]): string {
  const body = entries.map(([key, value]) => `  --${key}: ${value};`).join('\n');
  return `${selector} {\n${body}\n}`;
}

/**
 * Renders a theme item's `cssVars` as Tailwind v4 CSS. When the bundle's files
 * only touch part of the palette, the output is narrowed to those tokens; the
 * base shadcn tokens a project already has are never reprinted.
 */
export function themeCss(theme: RegistryItem | undefined, files: BundleFile[]): string {
  const cssVars = theme?.cssVars;
  if (!cssVars) return '';
  const source = files.map((file) => file.content).join('\n');

  const themeEntries = Object.entries(cssVars.theme ?? {});
  const used = themeEntries.filter(([, value]) => {
    const variable = variableName(value);
    return variable ? source.includes(variable) : false;
  });
  const selected = used.length > 0 ? used : themeEntries;
  const variables = new Set(
    selected.flatMap(([, value]) => {
      const variable = variableName(value);
      return variable ? [variable] : [];
    }),
  );

  const palette = (scope: Record<string, string> | undefined) =>
    Object.entries(scope ?? {}).filter(([key]) => variables.size === 0 || variables.has(key));

  const blocks: string[] = [];
  if (selected.length > 0)
    blocks.push(
      block(
        '@theme inline',
        selected.map(([key, value]) => [`${key}`, value]),
      ),
    );
  const light = palette(cssVars.light);
  if (light.length > 0) blocks.push(block(':root', light));
  const dark = palette(cssVars.dark);
  if (dark.length > 0) blocks.push(block('.dark', dark));
  return blocks.join('\n\n');
}

/** One copyable string for every file, separated by its target path. */
export function bundleToText(files: BundleFile[]): string {
  return files.map((file) => `// ─── ${file.targetPath}\n\n${file.content.trim()}\n`).join('\n');
}

/** The language `CodeBlock` should highlight a bundle file with. */
export function languageOf(path: string): 'tsx' | 'ts' {
  return path.endsWith('.tsx') ? 'tsx' : 'ts';
}
