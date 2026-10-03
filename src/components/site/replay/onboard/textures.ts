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

/**
 * Texels per side of the carbon weave, and the metres one repeat of it covers on a car: tows a
 * little broader than a real weave's, so it still reads from the chase camera.
 */
const WEAVE_SIZE = 64;
export const WEAVE_TILE_M = 0.05;

let weave: { map: Texture; roughness: Texture } | undefined;

/**
 * Carbon fibre's twill weave: tows of fibres crossing over and under in diagonal steps, each
 * tow round across its width as a bundle is. `map` is a grey to multiply the carbon's colour by,
 * light on each tow's crown and dark in the gaps; `roughness` (in the green channel, as three
 * reads it) is smoother on the crowns, so they catch the light as a sheen. The tows one way are
 * lighter and smoother than those across them, the checker that still shows where single tows
 * blur together. Made once and shared by every car; never freed.
 */
export function carbonWeaveTextures(): { map: Texture; roughness: Texture } {
  if (weave) return weave;
  const tow = 8;
  const colour = new Uint8Array(WEAVE_SIZE * WEAVE_SIZE * 4);
  const rough = new Uint8Array(WEAVE_SIZE * WEAVE_SIZE * 4);
  for (let y = 0; y < WEAVE_SIZE; y++) {
    for (let x = 0; x < WEAVE_SIZE; x++) {
      const column = Math.floor(x / tow);
      const row = Math.floor(y / tow);
      // A 2×2 twill: the tow on top steps one cell diagonally each row.
      const vertical = (column + row) % 2 === 0;
      const across = ((vertical ? x : y) % tow) / tow;
      const bundle = Math.sin(across * Math.PI) ** 0.7;
      const shade = Math.round((0.42 + 0.45 * bundle + (vertical ? 0.12 : 0)) * 255);
      const smooth = Math.round((1 - 0.35 * bundle - (vertical ? 0.1 : 0)) * 255);
      const at = (y * WEAVE_SIZE + x) * 4;
      colour.set([shade, shade, shade, 255], at);
      rough.set([smooth, smooth, smooth, 255], at);
    }
  }
  weave = {
    map: texture(colour, WEAVE_SIZE, true, MAX_ANISOTROPY),
    roughness: texture(rough, WEAVE_SIZE, false, MAX_ANISOTROPY),
  };
  for (const map of Object.values(weave)) map.repeat.setScalar(1 / WEAVE_TILE_M);
  return weave;
}

/** The size of the contact shadow's texture, and the metres of ground it covers (along, across). */
export const CONTACT_SHADOW = { width: 128, height: 64, metres: [6.4, 2.6] } as const;

let contact: Texture | undefined;

/**
 * The soft dark patch under a car where the ground is shaded by it: a blurred blob the shape of
 * the floor, darkest under the four tyres, as the sun's shadow map alone (sharp, and off at the
 * lower quality levels) does not ground the car. In the texture's green channel, as an alpha map.
 * `tyres` are the tyres' centres in metres from the car's centre (along, across).
 */
export function contactShadowTexture(tyres: readonly [number, number][]): Texture {
  if (contact) return contact;
  const { width, height, metres } = CONTACT_SHADOW;
  const data = new Uint8Array(width * height * 4);
  const smooth = (edge0: number, edge1: number, t: number) => {
    const u = Math.min(1, Math.max(0, (t - edge0) / (edge1 - edge0)));
    return u * u * (3 - 2 * u);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = ((x + 0.5) / width - 0.5) * metres[0];
      const across = ((y + 0.5) / height - 0.5) * metres[1];
      // The floor's shade: a rounded box from the front axle to the diffuser, soft at its edge.
      const floorAlong = Math.abs(along + 0.5) / 2.1;
      const floorAcross = Math.abs(across) / 0.95;
      const floorDistance = (floorAlong ** 4 + floorAcross ** 4) ** 0.25;
      let shade = 0.65 * smooth(1.25, 0.6, floorDistance);
      for (const [tx, tz] of tyres) {
        const distance = Math.hypot((along - tx) / 0.5, (across - tz) / 0.32);
        shade = Math.max(shade, smooth(1.1, 0.25, distance));
      }
      const value = Math.round(Math.min(1, shade) * 255);
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  contact = new DataTexture(data, width, height);
  contact.magFilter = LinearFilter;
  contact.minFilter = LinearFilter;
  contact.colorSpace = NoColorSpace;
  contact.needsUpdate = true;
  return contact;
}
