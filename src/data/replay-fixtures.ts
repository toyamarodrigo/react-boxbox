import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Test-only access to the dataset written by `bun run replays:build`. The tests that use it skip
 * when nothing has been generated yet, so a fresh checkout without the JSON still runs green.
 * Nothing here touches the network.
 */
const replayDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'data',
  'replays',
);

export function generatedReplayFiles(): string[] {
  if (!existsSync(replayDir)) return [];
  return readdirSync(replayDir)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .sort()
    .map((name) => path.join(replayDir, name));
}

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export const replayIndexFile = path.join(replayDir, 'index.json');
