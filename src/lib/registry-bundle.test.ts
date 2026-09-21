import { describe, expect, it } from 'vitest';
import {
  bundleToText,
  languageOf,
  resolveBundle,
  rewriteImports,
  targetPath,
  themeCss,
} from './registry-bundle';
import type { RegistryItem } from './registry-bundle';
import { manualBundle, registryItems } from './registry-items';

function itemMap(items: RegistryItem[]) {
  return new Map(items.map((item) => [item.name, item]));
}

const fixture = itemMap([
  {
    name: 'boxbox-types',
    type: 'registry:lib',
    files: [{ path: 'registry/boxbox/lib/types.ts', type: 'registry:lib', content: 'export {};' }],
  },
  {
    name: 'boxbox-motion',
    type: 'registry:lib',
    dependencies: ['motion'],
    files: [{ path: 'registry/boxbox/lib/motion.ts', type: 'registry:lib', content: 'export {};' }],
  },
  {
    name: 'boxbox-theme',
    type: 'registry:theme',
    cssVars: {
      theme: {
        'color-tyre-soft': 'var(--tyre-soft)',
        'color-flag-red': 'var(--flag-red)',
      },
      light: { 'tyre-soft': 'oklch(0.6 0.2 25)', 'flag-red': 'oklch(0.5 0.2 25)' },
      dark: { 'tyre-soft': 'oklch(0.7 0.2 25)', 'flag-red': 'oklch(0.6 0.2 25)' },
    },
  },
  {
    name: 'rolling-number',
    type: 'registry:ui',
    dependencies: ['motion'],
    registryDependencies: ['@boxbox/boxbox-motion'],
    files: [
      {
        path: 'registry/boxbox/ui/rolling-number.tsx',
        type: 'registry:ui',
        content: "import { DURATION } from '@/registry/boxbox/lib/motion';\n",
      },
    ],
  },
  {
    name: 'tyre-badge',
    type: 'registry:ui',
    dependencies: ['motion'],
    registryDependencies: [
      '@boxbox/boxbox-types',
      '@boxbox/boxbox-theme',
      '@boxbox/boxbox-motion',
      '@boxbox/rolling-number',
    ],
    files: [
      {
        path: 'registry/boxbox/ui/tyre-badge.tsx',
        type: 'registry:ui',
        content: "import { cn } from '@/lib/utils';\nconst c = 'bg-tyre-soft';\n",
      },
    ],
  },
  {
    name: 'overtake-indicator',
    type: 'registry:ui',
    dependencies: ['motion'],
    registryDependencies: ['@boxbox/boxbox-motion'],
    files: [
      {
        path: 'registry/boxbox/ui/overtake-indicator.tsx',
        type: 'registry:ui',
        content: 'export {};',
      },
    ],
  },
  {
    name: 'timing-tower',
    type: 'registry:ui',
    dependencies: ['motion'],
    registryDependencies: [
      '@boxbox/boxbox-types',
      '@boxbox/boxbox-theme',
      '@boxbox/boxbox-motion',
      '@boxbox/rolling-number',
      '@boxbox/tyre-badge',
      '@boxbox/overtake-indicator',
    ],
    files: [
      {
        path: 'registry/boxbox/ui/timing-tower.tsx',
        type: 'registry:ui',
        content: [
          "import type { TimingRow } from '@/registry/boxbox/lib/types';",
          "import { DURATION } from '@/registry/boxbox/lib/motion';",
          "import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';",
          "import { cn } from '@/lib/utils';",
          '',
        ].join('\n'),
      },
    ],
  },
]);

describe('rewriteImports', () => {
  it('maps registry ui and lib paths the way the CLI does and leaves @/lib/utils alone', () => {
    const rewritten = rewriteImports(
      [
        "import type { TimingRow } from '@/registry/boxbox/lib/types';",
        "import { TyreBadge } from '@/registry/boxbox/ui/tyre-badge';",
        "import { cn } from '@/lib/utils';",
      ].join('\n'),
    );

    expect(rewritten).toContain("from '@/lib/types'");
    expect(rewritten).toContain("from '@/components/ui/tyre-badge'");
    expect(rewritten).toContain("from '@/lib/utils'");
    expect(rewritten).not.toContain('@/registry/');
  });
});

describe('targetPath', () => {
  it('derives a target from the item type and prefers an explicit target', () => {
    expect(targetPath({ path: 'registry/boxbox/ui/tyre-badge.tsx', type: 'registry:ui' })).toBe(
      'components/ui/tyre-badge.tsx',
    );
    expect(targetPath({ path: 'registry/boxbox/lib/types.ts', type: 'registry:lib' })).toBe(
      'lib/types.ts',
    );
    expect(
      targetPath({
        path: 'registry/boxbox/ui/tyre-badge.tsx',
        type: 'registry:ui',
        target: '~/components/race/tyre-badge.tsx',
      }),
    ).toBe('components/race/tyre-badge.tsx');
  });
});

describe('resolveBundle', () => {
  it('resolves timing-tower transitively with libs first and the component last', () => {
    const bundle = resolveBundle('timing-tower', fixture);

    expect(bundle.files.map((file) => file.name)).toEqual([
      'types.ts',
      'motion.ts',
      'rolling-number.tsx',
      'tyre-badge.tsx',
      'overtake-indicator.tsx',
      'timing-tower.tsx',
    ]);
    expect(bundle.files.map((file) => file.targetPath)).toEqual([
      'lib/types.ts',
      'lib/motion.ts',
      'components/ui/rolling-number.tsx',
      'components/ui/tyre-badge.tsx',
      'components/ui/overtake-indicator.tsx',
      'components/ui/timing-tower.tsx',
    ]);
  });

  it('dedupes items reached through more than one path', () => {
    const names = resolveBundle('timing-tower', fixture).files.map((file) => file.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('dedupes npm dependencies', () => {
    expect(resolveBundle('timing-tower', fixture).npmDependencies).toEqual(['motion']);
  });

  it('keeps theme items out of the file list but records them', () => {
    const bundle = resolveBundle('timing-tower', fixture);
    expect(bundle.themeItems).toEqual(['boxbox-theme']);
    expect(bundle.files.some((file) => file.targetPath.includes('theme'))).toBe(false);
  });

  it('rewrites every registry import in the resolved files', () => {
    for (const file of resolveBundle('timing-tower', fixture).files) {
      expect(file.content).not.toContain('@/registry/');
    }
  });

  it('returns an empty bundle for an unknown item', () => {
    expect(resolveBundle('nope', fixture)).toEqual({
      files: [],
      npmDependencies: [],
      themeItems: [],
    });
  });
});

describe('themeCss', () => {
  it('emits only the token groups the bundle uses', () => {
    const css = themeCss(fixture.get('boxbox-theme'), [
      {
        name: 'tyre-badge.tsx',
        targetPath: 'components/ui/tyre-badge.tsx',
        content: 'bg-tyre-soft',
      },
    ]);

    expect(css).toContain('@theme inline {');
    expect(css).toContain('--color-tyre-soft: var(--tyre-soft);');
    expect(css).not.toContain('flag-red');
    expect(css).toContain(':root {');
    expect(css).toContain('.dark {');
  });

  it('falls back to the full palette when no token matches', () => {
    const css = themeCss(fixture.get('boxbox-theme'), []);
    expect(css).toContain('--color-tyre-soft');
    expect(css).toContain('--color-flag-red');
  });

  it('returns an empty string without a theme item', () => {
    expect(themeCss(undefined, [])).toBe('');
  });
});

describe('bundleToText', () => {
  it('separates each file with its target path', () => {
    const text = bundleToText(resolveBundle('timing-tower', fixture).files);
    expect(text).toContain('// ─── lib/types.ts');
    expect(text).toContain('// ─── components/ui/timing-tower.tsx');
    expect(text).not.toContain('@/registry/');
  });
});

describe('languageOf', () => {
  it('picks a highlighter language from the extension', () => {
    expect(languageOf('components/ui/timing-tower.tsx')).toBe('tsx');
    expect(languageOf('lib/types.ts')).toBe('ts');
  });
});

describe('the built registry', () => {
  it('bundles timing-tower from public/r with no unresolvable imports left', () => {
    const bundle = manualBundle('timing-tower');

    expect(bundle.files.map((file) => file.targetPath)).toEqual([
      'lib/types.ts',
      'lib/motion.ts',
      'components/ui/rolling-number.tsx',
      'components/ui/tyre-badge.tsx',
      'components/ui/overtake-indicator.tsx',
      'components/ui/timing-tower.tsx',
    ]);
    expect(bundle.npmDependencies).toEqual(['motion']);
    expect(bundle.themeItems).toEqual(['boxbox-theme']);
    expect(bundle.themeCss).toContain('@theme inline {');

    const targets = new Set(bundle.files.map((file) => file.targetPath));
    for (const file of bundle.files) {
      expect(file.content).not.toContain('@/registry/');
      // Every local import either lands on another bundled file or on the
      // `cn` helper shadcn already installs.
      for (const match of file.content.matchAll(/from '(@\/[^']+)'/g)) {
        const specifier = match[1] ?? '';
        if (specifier === '@/lib/utils') continue;
        const resolved = specifier.replace('@/', '');
        expect([...targets].some((target) => target.replace(/\.tsx?$/, '') === resolved)).toBe(
          true,
        );
      }
    }
  });

  it('exposes every built item except the index', () => {
    expect(registryItems.has('timing-tower')).toBe(true);
    expect(registryItems.has('boxbox-theme')).toBe(true);
    expect(registryItems.has('registry')).toBe(false);
  });
});
