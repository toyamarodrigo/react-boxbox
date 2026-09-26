import { describe, expect, it } from 'vitest';
import { usesDocsSidebar } from './layout';

describe('usesDocsSidebar', () => {
  it('keeps the sidebar on the documentation routes', () => {
    expect(usesDocsSidebar('/')).toBe(true);
    expect(usesDocsSidebar('/docs/installation')).toBe(true);
    expect(usesDocsSidebar('/components/timing-tower')).toBe(true);
  });

  it('drops it on the Replay showcase', () => {
    expect(usesDocsSidebar('/replay')).toBe(false);
    // Search params never reach it: the router hands over the pathname alone.
    expect(usesDocsSidebar(new URL('https://boxbox.test/replay?season=2026').pathname)).toBe(false);
  });
});
