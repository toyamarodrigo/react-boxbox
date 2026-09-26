import { defineConfig } from 'vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import tailwindcss from '@tailwindcss/vite';
import { contentSlugs } from './src/content/slugs.ts';

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({
      // A distinct shell request lets Nitro write both /index.html and /_shell.html.
      spa: { enabled: true, maskPath: '/?shell' },
      prerender: { enabled: true, crawlLinks: true },
      pages: [
        { path: '/', prerender: { enabled: true, outputPath: '/index.html' } },
        ...[
          '/docs/installation',
          '/docs/theming',
          '/components',
          // The shell only: the race JSON is fetched in the browser, never prerendered in.
          '/replay',
          ...contentSlugs.map((slug) => `/components/${slug}`),
        ].map((path) => ({ path, prerender: { enabled: true } })),
      ],
    }),
    nitro(),
    viteReact(),
    tailwindcss(),
  ],
});

export default config;
