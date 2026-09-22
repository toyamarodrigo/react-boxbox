import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * Testing Library waits one second by default, which is not enough for this suite's heaviest
 * work: a route test builds a router, resolves two fetches, mounts a lazy chunk and runs a
 * 100 ms clock, and forty jsdom environments are competing for the CPU while it does. The
 * `/replay` gap chart arrives through `React.lazy`, and the wait for it timed out at 2.3 s in a
 * full run that passed on its own. The limit is there to stop a hanging test, not to measure
 * speed, so it is raised rather than tightened.
 */
configure({ asyncUtilTimeout: 5000 });

// `globals: false` means Testing Library cannot register its own auto cleanup.
afterEach(cleanup);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
