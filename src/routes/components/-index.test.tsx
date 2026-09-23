import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { visible } from '../../content';
import { getRouter } from '../../router';
import { stubElementSize } from '../../test/chart-size';

let restoreSize: () => void;

// The gap chart preview is drawn by Recharts, which renders nothing at jsdom's zero size.
beforeEach(() => {
  restoreSize = stubElementSize();
});

afterEach(() => {
  restoreSize();
});

describe('/components', () => {
  it('shows a preview in every card', async () => {
    const router = getRouter();
    router.update({ history: createMemoryHistory({ initialEntries: ['/components'] }) });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1, name: 'Components' });

    for (const item of visible()) {
      const heading = await screen.findByRole('heading', { level: 2, name: item.name });
      const card = heading.closest('a');
      expect(card).toHaveAttribute('href', `/components/${item.slug}`);

      const preview = card?.querySelector('[data-slot="component-preview"]');
      expect(preview).toHaveAttribute('aria-hidden', 'true');
      // Inert, so the chart's own tab stop does not add a hidden one inside the link.
      expect(preview).toHaveAttribute('inert');
      // The gap chart arrives through `React.lazy`; the rest are there on the first render.
      await waitFor(() => expect(preview?.childElementCount).toBeGreaterThan(0));
      // Hidden from assistive technology, so the card still reads as its heading and text.
      expect(within(card as HTMLElement).queryAllByRole('img')).toHaveLength(0);
    }
  });
});
