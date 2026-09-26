import { describe, expect, it } from 'vitest';
import { seo } from './seo';

describe('seo', () => {
  it('builds a meta array with absolute URLs from a relative path and default image', () => {
    const meta = seo({
      title: 'Tyre Badge — boxbox',
      description: 'A broadcast tyre marker.',
      path: '/components/tyre-badge',
    });

    expect(meta).toContainEqual({ title: 'Tyre Badge — boxbox' });
    expect(meta).toContainEqual({ name: 'description', content: 'A broadcast tyre marker.' });
    expect(meta).toContainEqual({
      property: 'og:url',
      content: 'https://react-boxbox.vercel.app/components/tyre-badge',
    });
    expect(meta).toContainEqual({
      property: 'og:image',
      content: 'https://react-boxbox.vercel.app/og/default.png',
    });
    expect(meta).toContainEqual({ property: 'og:image:width', content: '1200' });
    expect(meta).toContainEqual({ property: 'og:image:height', content: '630' });
    expect(meta).toContainEqual({ property: 'og:type', content: 'website' });
    expect(meta).toContainEqual({ property: 'og:site_name', content: 'boxbox' });
    expect(meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' });
  });

  it('resolves a per-route image path to an absolute URL', () => {
    const meta = seo({
      title: 'Tyre Badge — boxbox',
      description: 'A broadcast tyre marker.',
      path: '/components/tyre-badge',
      image: '/og/tyre-badge.png',
    });

    expect(meta).toContainEqual({
      property: 'og:image',
      content: 'https://react-boxbox.vercel.app/og/tyre-badge.png',
    });
    expect(meta).toContainEqual({
      name: 'twitter:image',
      content: 'https://react-boxbox.vercel.app/og/tyre-badge.png',
    });
  });

  it('leaves an already-absolute image URL untouched', () => {
    const meta = seo({
      title: 'boxbox',
      description: 'Race graphics for React.',
      path: '/',
      image: 'https://example.com/custom.png',
    });

    expect(meta).toContainEqual({
      property: 'og:image',
      content: 'https://example.com/custom.png',
    });
  });
});
