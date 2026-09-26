import type { ComponentProps } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import registry from '../../registry.json';
import { ComponentPageBody } from '../components/site/component-page';
import { manualBundle } from '../lib/registry-items';
import { contentSlugs } from './slugs';
import { manifest, visible, categoryOrder } from './index';
import { defineControls } from './types';
import controls from './example/controls';
import ExampleSignal from './example/demo';
import example from './example/meta';

const knownItems = new Set(registry.items.map((item) => item.name));

describe('content manifest', () => {
  it('keeps unique slugs, valid categories, and registered visible items', () => {
    expect(new Set(manifest.map((item) => item.slug)).size).toBe(manifest.length);
    for (const item of manifest) {
      expect(categoryOrder).toContain(item.category);
      if (item.status !== 'hidden') expect(knownItems.has(item.registryName)).toBe(true);
    }
    expect(visible()).not.toContain(example);
  });

  it('matches the dependency-free prerender slug list', () => {
    expect([...contentSlugs].sort()).toEqual(manifest.map((item) => item.slug).sort());
  });
});

describe('defineControls', () => {
  it('derives validated defaults and preserves inferred prop types', () => {
    expect(controls.schema.parse({})).toEqual(controls.defaults);
    expect(controls.defaults).toEqual({
      active: true,
      level: 4,
      mode: 'race',
      color: '#dc2626',
      label: 'BOXBOX',
    });
    expect(controls.schema.safeParse({ ...controls.defaults, level: 11 }).success).toBe(false);
    expectTypeOf(controls.defaults.active).toEqualTypeOf<boolean>();
    expectTypeOf(controls.defaults.level).toEqualTypeOf<number>();
    expectTypeOf(controls.defaults.mode).toEqualTypeOf<'race' | 'practice' | 'qualifying'>();
    expectTypeOf(controls.defaults.color).toEqualTypeOf<string>();
    expectTypeOf(controls.defaults.label).toEqualTypeOf<string>();
    const minimal = defineControls({
      enabled: { kind: 'boolean', label: 'Enabled', default: false },
    });
    expect(minimal.defaults.enabled).toBe(false);
  });
});

describe('component page', () => {
  it('renders the example preview, install command, and props from one control definition', () => {
    render(
      <ComponentPageBody
        meta={example}
        definition={controls}
        Demo={ExampleSignal as unknown as ComponentProps<typeof ComponentPageBody>['Demo']}
        bundle={manualBundle('tyre-badge')}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Example Signal' })).toBeInTheDocument();
    expect(screen.getAllByText('BOXBOX').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'bunx shadcn@latest registry add @boxbox=https://react-boxbox.vercel.app/r/{name}.json',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('bunx shadcn@latest add @boxbox/example')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Playground' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'level' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'RACE LIVE' },
    });
    expect(screen.getByText('RACE LIVE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Active' }));
    expect(screen.getByText('OFF AIR')).toBeInTheDocument();
  });
});
