/**
 * Small textures the Onboard view generates instead of downloading: the grain of the asphalt,
 * the run-off and the kerbs, the asphalt's roughness, and the catch fence's mesh. Seeded, so
 * they look the same on every visit.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/** A small seeded generator, so the scenery stands in the same place on every visit. */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiling value noise on a `size` square grid of `cells`, in 0..1. */
function valueNoise(size: number, cells: number, next: () => number): Float32Array {
  const lattice = Float32Array.from({ length: cells * cells }, next);
  const out = new Float32Array(size * size);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const at = (cx: number, cy: number) => lattice[(cy % cells) * cells + (cx % cells)]!;
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      out[y * size + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/**
 * The most anisotropic filtering the textures ask for: the renderer's maximum up to this, as
 * WebGPU allows 16 and a WebGL2 driver may allow less (three clamps to what it reports there).
 */
export const MAX_ANISOTROPY = 16;

/**
 * A repeating texture with mipmaps and trilinear filtering. All three filters linear is also what
 * WebGPU needs before it uses `anisotropy`, which keeps the ground sharp at the T-cam's grazing
 * angle. Colour in sRGB; data (roughness) left linear.
 */
function texture(data: Uint8Array, size: number, colour: boolean, anisotropy: number): DataTexture {
  const map = new DataTexture(data, size, size);
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = Math.max(1, Math.min(anisotropy, MAX_ANISOTROPY));
  map.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  map.needsUpdate = true;
  return map;
}

/**
 * Texels per side of the ground's grain textures. The strips map them over `GRAIN_TILE_M`
 * (see `MeshBuilder.strip`), about 8 mm a texel, so the asphalt stays crisp a metre from the
 * T-cam.
 */
const SIZE = 512;

/** How many metres of ground one grain texture covers before it repeats. */
export const GRAIN_TILE_M = 4;

/** A look for `grain`: its shade from `base` up, by how much each layer of noise adds. */
type GrainLook = { base: number; patches: number; mottle: number; speckle: number };

const GRAIN_LOOKS = {
  asphalt: { base: 0.82, patches: 0.08, mottle: 0.05, speckle: 0.07 },
  // Coarser and with more contrast, for the run-off's grass and gravel alike.
  ground: { base: 0.7, patches: 0.12, mottle: 0.1, speckle: 0.12 },
  // Faint, so the kerbs' red and white stay clean.
  paint: { base: 0.9, patches: 0.03, mottle: 0.03, speckle: 0.06 },
} as const satisfies Record<string, GrainLook>;

/**
 * The noise the grains are made of, 1 m patches, 12 cm mottling and a speckle a texel each, and
 * the texels made from them. Generated once and kept: every circuit's textures share them, so
 * opening another circuit does not work them out again.
 */
let layers: { patches: Float32Array; mottle: Float32Array; speckle: Float32Array } | undefined;
const texels = new Map<keyof typeof GRAIN_LOOKS | 'roughness', Uint8Array>();

function grainTexels(name: keyof typeof GRAIN_LOOKS | 'roughness'): Uint8Array {
  const cached = texels.get(name);
  if (cached) return cached;
  if (!layers) {
    const next = random(0x6a5);
    layers = {
      patches: valueNoise(SIZE, GRAIN_TILE_M, next),
      mottle: valueNoise(SIZE, GRAIN_TILE_M * 8, next),
      speckle: Float32Array.from({ length: SIZE * SIZE }, next),
    };
  }
  const { patches, mottle, speckle } = layers;
  const look: GrainLook =
    name === 'roughness'
      ? // Mostly rough, a little smoother where the asphalt is worn.
        { base: 0.78, patches: 0, mottle: 0.18, speckle: 0.04 }
      : GRAIN_LOOKS[name];
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let index = 0; index < SIZE * SIZE; index++) {
    const shade =
      look.base +
      look.patches * patches[index]! +
      look.mottle * mottle[index]! +
      look.speckle * speckle[index]!;
    const value = Math.round(Math.min(1, shade) * 255);
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  texels.set(name, data);
  return data;
}

/**
 * A grain to multiply a surface's colour by, close to white so the strip's own colour stays in
 * charge: the asphalt's, the run-off's or the kerbs' paint.
 */
export const grainTexture = (name: keyof typeof GRAIN_LOOKS, anisotropy: number): Texture =>
  texture(grainTexels(name), SIZE, true, anisotropy);

/** The asphalt's roughness, in the green channel as three reads it; it follows the mottling. */
export const roughnessTexture = (anisotropy: number): Texture =>
  texture(grainTexels('roughness'), SIZE, false, anisotropy);

/** The catch fence: a square wire mesh, opaque on the wires and clear between them. */
export function fenceTexture(anisotropy: number): Texture {
  const size = 64;
  const cell = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Diagonal wires, as a chain-link fence's diamonds.
      const a = (x + y) % cell;
      const b = (x - y + size) % cell;
      const wire = a < 2 || b < 2;
      data.set([200, 204, 208, wire ? 255 : 0], (y * size + x) * 4);
    }
  }
  return texture(data, size, true, anisotropy);
}
