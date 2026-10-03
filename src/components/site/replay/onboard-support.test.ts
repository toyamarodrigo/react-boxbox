import { afterEach, describe, expect, it, vi } from 'vitest';
import { ONBOARD_BLOCKED, onboardBlocker } from './onboard-support';

describe('onboardBlocker', () => {
  it('offers the Onboard view with WebGPU or WebGL2', () => {
    expect(onboardBlocker({ webgpu: true, webgl2: true }, false)).toBeUndefined();
    expect(onboardBlocker({ webgpu: true, webgl2: false }, false)).toBeUndefined();
    expect(onboardBlocker({ webgpu: false, webgl2: true }, false)).toBeUndefined();
  });

  it('says 3D needs WebGL2 with neither, before anything else', () => {
    expect(onboardBlocker({ webgpu: false, webgl2: false }, false)).toBe(ONBOARD_BLOCKED.graphics);
    expect(onboardBlocker({ webgpu: false, webgl2: false }, true)).toBe(ONBOARD_BLOCKED.graphics);
  });

  it('does not offer a moving camera under reduced motion', () => {
    expect(onboardBlocker({ webgpu: true, webgl2: true }, true)).toBe(
      ONBOARD_BLOCKED.reducedMotion,
    );
  });
});

describe('graphicsSupport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** A fresh copy of the module, which finds the support once and keeps it. */
  const fresh = async () => (await import('./graphics-support')).graphicsSupport;

  it('finds WebGL2 from a throwaway context, and hands that context back', async () => {
    const loseContext = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (kind: string) =>
        (kind === 'webgl2'
          ? { getExtension: () => ({ loseContext }) }
          : null) as unknown as RenderingContext,
    );
    const support = await fresh();
    expect(support()).toEqual({ webgpu: false, webgl2: true });
    expect(loseContext).toHaveBeenCalledOnce();
    // Found once: a second call makes no new context.
    support();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledOnce();
  });

  it('finds WebGPU from navigator.gpu, and neither without them', async () => {
    vi.stubGlobal('navigator', { ...navigator, gpu: {} });
    expect((await fresh())()).toEqual({ webgpu: true, webgl2: false });
    vi.unstubAllGlobals();
    vi.resetModules();
    expect((await fresh())()).toEqual({ webgpu: false, webgl2: false });
  });

  it('takes a canvas that throws for no WebGL2', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect((await fresh())()).toEqual({ webgpu: false, webgl2: false });
  });
});
