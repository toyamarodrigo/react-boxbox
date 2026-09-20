import { defineConfig } from 'vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import tailwindcss from '@tailwindcss/vite';

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({
      // A distinct shell request lets Nitro write both /index.html and /_shell.html.
      spa: { enabled: true, maskPath: '/?shell' },
      prerender: { enabled: true, crawlLinks: true },
      pages: [{ path: '/', prerender: { enabled: true, outputPath: '/index.html' } }],
    }),
    nitro(),
    viteReact(),
    tailwindcss(),
  ],
});

export default config;
