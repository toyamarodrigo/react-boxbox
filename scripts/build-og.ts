import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import React from 'react';

import { categoryNames, visible } from '../src/content/index.ts';

const WIDTH = 1200;
const HEIGHT = 630;

// Hard-coded sRGB values converted from the `.dark` OKLCH tokens in src/styles.css,
// since satori/resvg do not resolve CSS variables or the oklch() color function.
const COLORS = {
  background: '#030303',
  foreground: '#fafafa',
  mutedForeground: '#a1a1a1',
  border: '#292929',
  primary: '#df0913',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'public', 'og');

const fontDir = (pkg: string) => path.join(rootDir, 'node_modules', '@fontsource', pkg, 'files');

async function loadFonts() {
  const [display400, display900, mono700] = await Promise.all([
    readFile(path.join(fontDir('titillium-web'), 'titillium-web-latin-400-normal.woff')),
    readFile(path.join(fontDir('titillium-web'), 'titillium-web-latin-900-normal.woff')),
    readFile(path.join(fontDir('jetbrains-mono'), 'jetbrains-mono-latin-700-normal.woff')),
  ]);
  return [
    { name: 'Titillium Web', data: display400, weight: 400 as const, style: 'normal' as const },
    { name: 'Titillium Web', data: display900, weight: 900 as const, style: 'normal' as const },
    { name: 'JetBrains Mono', data: mono700, weight: 700 as const, style: 'normal' as const },
  ];
}

const el = React.createElement;

function card({
  name,
  category,
  description,
}: {
  name: string;
  category?: string;
  description: string;
}) {
  return el(
    'div',
    {
      style: {
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: COLORS.background,
        padding: '72px',
        fontFamily: 'Titillium Web',
      },
    },
    el(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          fontSize: '32px',
          fontWeight: 900,
          color: COLORS.foreground,
          letterSpacing: '-0.02em',
        },
      },
      'boxbox',
      el('span', { style: { color: COLORS.primary } }, '.'),
    ),
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '24px' } },
      category
        ? el(
            'div',
            {
              style: {
                display: 'flex',
                fontFamily: 'JetBrains Mono',
                fontWeight: 700,
                fontSize: '22px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: COLORS.primary,
              },
            },
            category,
          )
        : null,
      el(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: category ? '84px' : '64px',
            fontWeight: 900,
            lineHeight: 1.05,
            color: COLORS.foreground,
            maxWidth: '980px',
          },
        },
        name,
      ),
      el(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: '28px',
            fontWeight: 400,
            lineHeight: 1.4,
            color: COLORS.mutedForeground,
            maxWidth: '860px',
          },
        },
        description,
      ),
    ),
    el('div', {
      style: {
        display: 'flex',
        width: '100%',
        height: '2px',
        backgroundColor: COLORS.border,
      },
    }),
  );
}

async function renderPng(
  fonts: Awaited<ReturnType<typeof loadFonts>>,
  content: Parameters<typeof card>[0],
) {
  const svg = await satori(card(content), { width: WIDTH, height: HEIGHT, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
  return resvg.render().asPng();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const fonts = await loadFonts();

  const defaultPng = await renderPng(fonts, {
    name: 'Race graphics for React',
    description:
      'Broadcast-inspired React components for timing, race control and the pit lane, distributed through the shadcn registry.',
  });
  await writeFile(path.join(outDir, 'default.png'), defaultPng);
  const written = ['default.png'];

  for (const item of visible()) {
    const png = await renderPng(fonts, {
      name: item.name,
      category: categoryNames[item.category],
      description: item.description,
    });
    await writeFile(path.join(outDir, `${item.slug}.png`), png);
    written.push(`${item.slug}.png`);
  }

  console.log(`Wrote ${written.length} OG images to public/og:`);
  for (const file of written) console.log(`  - ${file}`);
}

await main();
