import { useSyncExternalStore } from 'react';
import { type GraphicsSupport, graphicsSupport } from './graphics-support';

/** Why the Onboard view is not offered, in a few words beside its toggle. */
export const ONBOARD_BLOCKED = {
  graphics: '3D needs WebGL2',
  reducedMotion: '3D is off with reduced motion',
} as const;

/**
 * Why this browser gets the Track Map only, or `undefined` when the Onboard view can open: it
 * needs WebGPU or WebGL2, and a viewer who asks for reduced motion is not offered a moving
 * camera.
 */
export function onboardBlocker(
  graphics: GraphicsSupport,
  reducedMotion: boolean,
): string | undefined {
  if (!graphics.webgpu && !graphics.webgl2) return ONBOARD_BLOCKED.graphics;
  if (reducedMotion) return ONBOARD_BLOCKED.reducedMotion;
  return undefined;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const blockerNow = () =>
  onboardBlocker(graphicsSupport(), window.matchMedia?.(REDUCED_MOTION).matches ?? false);

/**
 * `onboardBlocker` for this browser, following a change of the reduced-motion setting. The
 * server and the first client render offer the view; the check runs once hydrated.
 */
export function useOnboardBlocker(): string | undefined {
  return useSyncExternalStore(subscribe, blockerNow, () => undefined);
}
