import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeroSequence } from './home/hero-sequence';
import { getRouter } from '../../router';

/** Tabs forward until `element` has focus, so the test proves it is reachable. */
async function tabTo(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
  for (let step = 0; step < 20; step++) {
    if (document.activeElement === element) return step;
    await user.tab();
  }
  throw new Error(`never reached ${element.outerHTML.slice(0, 80)} by tabbing`);
}

describe('keyboard: theme toggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('is reachable by Tab and switches the theme on Enter', async () => {
    const user = userEvent.setup();
    const router = getRouter();
    router.update({ history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: /Every second/ });

    // The shell renders `<html class="dark">`, which React 19 hoists onto the
    // real document, so read the starting theme instead of assuming it.
    const startedDark = document.documentElement.classList.contains('dark');
    const toggle = screen.getByRole('button', { name: /^Switch to (dark|light) mode$/ });
    expect(toggle).toHaveAccessibleName(
      startedDark ? 'Switch to light mode' : 'Switch to dark mode',
    );
    await tabTo(user, toggle);

    await user.keyboard('{Enter}');
    expect(document.documentElement.classList.contains('dark')).toBe(!startedDark);
    expect(localStorage.getItem('boxbox-theme')).toBe(startedDark ? 'light' : 'dark');
    // The label follows the state, so the button never lies about what it does.
    expect(
      screen.getByRole('button', {
        name: startedDark ? 'Switch to dark mode' : 'Switch to light mode',
      }),
    ).toHaveFocus();

    // Space activates a button too, and takes the theme back.
    await user.keyboard(' ');
    expect(document.documentElement.classList.contains('dark')).toBe(startedDark);
    expect(localStorage.getItem('boxbox-theme')).toBe(startedDark ? 'dark' : 'light');
  });

  it('puts a skip link first in the tab order', async () => {
    const user = userEvent.setup();
    const router = getRouter();
    router.update({ history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: /Every second/ });

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
  });
});

describe('keyboard: hero restart', () => {
  it('re-arms the gantry when Restart is activated from the keyboard', async () => {
    // Real timers: user-event and fake timers fight over the same queue, and the
    // gantry only needs 60ms of real time at this interval.
    const user = userEvent.setup();
    render(<HeroSequence interval={10} holdRange={[10, 10]} random={() => 0} />);

    // Five lights, then the hold, then the tower takes over.
    expect(await screen.findByRole('list', { name: 'Timing tower' })).toBeInTheDocument();

    const restart = screen.getByRole('button', { name: /Restart/ });
    await tabTo(user, restart);
    await user.keyboard('{Enter}');

    // Elements on their way out stay mounted for their exit animation, so read
    // the newest gantry: it is the one `restart` just armed.
    const gantries = document.querySelectorAll('[data-slot="start-lights"]');
    const armed = gantries[gantries.length - 1];
    expect(armed?.getAttribute('data-phase')).not.toBe('out');
    await waitForElementToBeRemoved(() => screen.queryByRole('list', { name: 'Timing tower' }));
  });
});
