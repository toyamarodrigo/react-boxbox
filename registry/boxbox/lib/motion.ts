import type { Transition } from 'motion/react';

/**
 * Shared motion tokens for boxbox components.
 *
 * Broadcast graphics are watched, not operated: motion is how a state change is
 * shown. Keep it crisp. Enters use `EASE_OUT`, movement on screen uses
 * `EASE_IN_OUT` or `SPRING_ROW`, and `EASE_IN` is only for elements that leave
 * the screen entirely. Exits are always shorter than enters.
 */

/** Strong ease-out: starts fast, settles gently. For anything entering or changing value. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Strong ease-in-out: for elements that move from one on-screen place to another. */
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/** Ease-in: only for elements accelerating off screen, never for UI that stays visible. */
export const EASE_IN = [0.68, 0, 0.77, 0] as const;

/** Durations in seconds. `tick` is for values that change on every data update. */
export const DURATION = { tick: 0.15, fast: 0.2, base: 0.3, slow: 0.45 } as const;

/** Bounce-less spring for rows that change position in a list. */
export const SPRING_ROW: Transition = { type: 'spring', duration: 0.45, bounce: 0 };
