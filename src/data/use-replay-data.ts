import { useCallback, useEffect, useState } from 'react';
import type { ReplayIndex, ReplayRace } from './replay-schema';
import { replayIndexSchema, replayRaceSchema } from './replay-schema';

/**
 * Loads the static replay dataset from the same origin, on demand.
 *
 * A race file is a few hundred kilobytes, so none of it is bundled: the page fetches the index
 * first and then the one race it is showing. Nothing runs at module scope and every fetch lives
 * in an effect, so the route prerenders to a shell and the request happens in the browser.
 */

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export type AsyncState<T> = {
  status: AsyncStatus;
  data?: T;
  error?: string;
  /** Drops the cached value and fetches again, for the retry button. */
  reload: () => void;
};

/** Parsed payloads, kept for the session so switching races back and forth is instant. */
const indexCache = new Map<string, ReplayIndex>();
const raceCache = new Map<string, ReplayRace>();

/** Empties both caches. Tests use it so one test's payload cannot answer the next one's fetch. */
export function clearReplayCache(): void {
  indexCache.clear();
  raceCache.clear();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function useJsonResource<T>({
  key,
  url,
  cache,
  parse,
}: {
  key: string | undefined;
  url: string | undefined;
  cache: Map<string, T>;
  parse: (value: unknown) => T;
}): AsyncState<T> {
  // A success lands in the cache and the status is derived from the cache during render, so
  // this state exists only to record the outcome and to re-render when one arrives.
  const [settled, setSettled] = useState<{ key: string; attempt: number; error?: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);

  const cached = key === undefined ? undefined : cache.get(key);

  useEffect(() => {
    if (key === undefined || url === undefined || cache.has(key)) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
        const parsed = parse(await response.json());
        if (controller.signal.aborted) return;
        cache.set(key, parsed);
        setSettled({ key, attempt });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSettled({ key, attempt, error: messageOf(error) });
      }
    })();

    return () => controller.abort();
    // `cache` and `parse` are module-level constants, so only the target and the retry move.
  }, [key, url, attempt, cache, parse]);

  const reload = useCallback(() => {
    if (key !== undefined) cache.delete(key);
    setAttempt((value) => value + 1);
  }, [cache, key]);

  if (key === undefined) return { status: 'idle', reload };
  if (cached !== undefined) return { status: 'ready', data: cached, reload };
  if (settled?.key === key && settled.attempt === attempt && settled.error !== undefined) {
    return { status: 'error', error: settled.error, reload };
  }
  return { status: 'loading', reload };
}

const parseIndex = (value: unknown): ReplayIndex => replayIndexSchema.parse(value);
const parseRace = (value: unknown): ReplayRace => replayRaceSchema.parse(value);

/** The list of curated races written by `bun run replays:build`. */
export function useReplayIndex(): AsyncState<ReplayIndex> {
  return useJsonResource({
    key: 'index',
    url: '/data/replays/index.json',
    cache: indexCache,
    parse: parseIndex,
  });
}

/** One race by `<season>-<round>` id. Passing `undefined` keeps the hook idle. */
export function useReplayRace(id: string | undefined): AsyncState<ReplayRace> {
  return useJsonResource({
    key: id,
    url: id === undefined ? undefined : `/data/replays/${id}.json`,
    cache: raceCache,
    parse: parseRace,
  });
}
