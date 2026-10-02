/**
 * Which 3D graphics APIs the browser offers, found once without loading three.js: WebGPU when
 * `navigator.gpu` is there (an adapter can still be refused later, which the Onboard scene
 * handles), WebGL2 when a throwaway canvas gives a `webgl2` context.
 */
export type GraphicsSupport = { webgpu: boolean; webgl2: boolean };

let found: GraphicsSupport | undefined;

export function graphicsSupport(): GraphicsSupport {
  if (found) return found;
  if (typeof window === 'undefined') return { webgpu: false, webgl2: false };
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu != null;
  let webgl2 = false;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    webgl2 = context != null;
    // Handed back at once: browsers allow only a few live contexts per page.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2 = false;
  }
  found = { webgpu, webgl2 };
  return found;
}
