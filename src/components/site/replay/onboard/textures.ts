/**
 * Small textures the Onboard view generates instead of downloading: the asphalt's grain and
 * roughness, and the catch fence's mesh. Seeded, so a circuit looks the same on every visit.
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

function texture(data: Uint8Array, size: number, colour: boolean): DataTexture {
  const map = new DataTexture(data, size, size);
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  // Seen at a grazing angle from the T-cam, so filtered across as well as along.
  map.anisotropy = 8;
  map.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  map.needsUpdate = true;
  return map;
}

const SIZE = 256;

/**
 * The asphalt's grain, to multiply its colour by: fine speckle over larger, softer patches,
 * close to white so the strip's own colour stays in charge. And its roughness, in the green
 * channel as three reads it: mostly rough, a little smoother where the patches are worn.
 */
export function asphaltTextures(seed: number): { map: Texture; roughness: Texture } {
  const next = random(seed);
  const patches = valueNoise(SIZE, 8, next);
  const mottle = valueNoise(SIZE, 32, next);
  const colour = new Uint8Array(SIZE * SIZE * 4);
  const rough = new Uint8Array(SIZE * SIZE * 4);
  for (let index = 0; index < SIZE * SIZE; index++) {
    const grain = next();
    const shade = 0.82 + 0.08 * patches[index]! + 0.05 * mottle[index]! + 0.07 * grain;
    const value = Math.round(Math.min(1, shade) * 255);
    colour.set([value, value, value, 255], index * 4);
    const roughness = Math.round((0.78 + 0.18 * mottle[index]! + 0.04 * grain) * 255);
    rough.set([roughness, roughness, roughness, 255], index * 4);
  }
  return { map: texture(colour, SIZE, true), roughness: texture(rough, SIZE, false) };
}

/** The catch fence: a square wire mesh, opaque on the wires and clear between them. */
export function fenceTexture(): Texture {
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
  return texture(data, size, true);
}
