import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { visible } from '@/content';
import { stubElementSize } from '@/test/chart-size';
import { ComponentPreview } from './previews';

let restoreSize: () => void;

// Recharts draws nothing into a zero-sized container, and jsdom sizes everything at zero.
beforeEach(() => {
  restoreSize = stubElementSize();
});

afterEach(() => {
  restoreSize();
});

describe('ComponentPreview', () => {
  it.each(visible().map((item) => item.slug))('renders a preview for %s', async (slug) => {
    const { container } = render(<ComponentPreview slug={slug} />);
    // The gap chart arrives through `React.lazy`; the rest are there on the first render.
    await waitFor(() => expect(container.childElementCount).toBeGreaterThan(0));
  });

  it('draws the gap chart once its module has loaded', async () => {
    render(<ComponentPreview slug="gap-chart" />);
    await screen.findByRole('img', { name: /Gap to the leader/ });
    await waitFor(() => expect(document.querySelectorAll('.recharts-line')).toHaveLength(4));
  });

  it('renders nothing for an unknown or hidden slug', () => {
    for (const slug of ['nope', 'example']) {
      const { container, unmount } = render(<ComponentPreview slug={slug} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
