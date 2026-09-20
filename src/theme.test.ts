import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const registry = JSON.parse(readFileSync('registry.json', 'utf8')) as {
  items: { name: string; cssVars?: Record<string, Record<string, string>> }[];
};
const css = readFileSync('src/styles.css', 'utf8');
const parseVars = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]),
  );

it('keeps registry theme tokens identical to the site stylesheet', () => {
  const vars = registry.items.find((item) => item.name === 'boxbox-theme')!.cssVars!;
  for (const [mode, selector] of [
    ['light', ':root'],
    ['dark', '.dark'],
  ] as const) {
    const block = css.match(new RegExp(`\\${selector} \\{([^}]+)\\}`))?.[1];
    expect(block).toBeDefined();
    expect(parseVars(block!)).toEqual(vars[mode]);
  }
  const themeBlock = css.match(/@theme inline \{([^}]+)\}/)?.[1];
  expect(themeBlock).toBeDefined();
  const custom = Object.fromEntries(
    Object.entries(parseVars(themeBlock!)).filter(([name]) =>
      /^(color-(sector|status|tyre|flag)-|font-(display|mono)$)/.test(name),
    ),
  );
  expect(custom).toEqual(vars.theme);
});
