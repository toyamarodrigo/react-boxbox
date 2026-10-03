/**
 * The Onboard view's car: its parts (`car-parts`) merged into a near and a far level of detail,
 * its materials for a quality level, and the rig that stands one car on the track, spins its
 * wheels, bobs and rolls its body and fades it to a ghost.
 *
 * The body is one mesh per level, its triangles grouped by material (`CAR_MATERIAL`); the four
 * wheels of the near level are one instanced mesh, so they can spin. The geometries are made once
 * and shared by every car; the materials are each car's own, as its colour and its ghost fade.
 */
import {
  BufferAttribute,
  type BufferGeometry,
  Group,
  InstancedMesh,
  LOD,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_LENGTH_M } from '@/data/onboard-frame';
import { cornerRoll, rearLightLevel, suspensionBob, wheelSpin } from './car-motion';
import {
  AXLE,
  CAR_MATERIAL,
  type CarMaterialName,
  type Parts,
  TYRE_WIDTH,
  WHEEL_CENTRES,
  WHEEL_RADIUS,
  farParts,
  nearParts,
  wheelParts,
} from './car-parts';
import { CONTACT_SHADOW, carbonWeaveTextures, contactShadowTexture } from './textures';

export { CAR_HEIGHT_M, CAR_MATERIAL, CAR_WIDTH_M } from './car-parts';

/** How far from the camera, in metres, a car switches to its far level of detail. */
export const CAR_LOD_SWITCH_M = 70;

/**
 * How the car is drawn at a quality level: `rich` paints it with a clearcoat and weaves its
 * carbon; `plain` keeps the cheaper standard materials, for the low level.
 */
export type CarLook = 'plain' | 'rich';

/**
 * The paint's second tone: the bodywork below `below` metres is far darker, blended over
 * `blend`, so the lower body reads as a dark shade of the team colour, not black. Ahead of
 * `noseFrom` metres the line drops along the nose to `noseTip` at its tip, so the low nose keeps
 * its colour.
 */
const LOWER_TONE = {
  below: 0.3,
  blend: 0.04,
  shade: 0.28,
  noseFrom: 1.2,
  noseTip: 0.06,
} as const;

/** Where the paint's lower tone starts, in metres up, `x` metres along the car. */
function lowerToneLine(x: number): number {
  const { below, noseFrom, noseTip } = LOWER_TONE;
  const along = Math.min(1, Math.max(0, (x - noseFrom) / (CAR_LENGTH_M / 2 - noseFrom)));
  return below + (noseTip - below) * along;
}
/** How much lighter the tyres' sidewalls are than their tread. */
const SIDEWALL_SHADE = 1.6;

/** The materials' colours; `plainCarbon` is the woven carbon's average, for the plain look. */
const COLOURS = {
  carbon: '#4b4d51',
  plainCarbon: '#3b3d40',
  metal: '#aeb2b8',
  rubber: '#161616',
  light: '#ff2a1e',
} as const;

/** The rear light's glow at full and the shadow's darkness when the car is solid. */
const LIGHT_INTENSITY = 6;
const SHADOW_OPACITY = 0.6;

const MATERIAL_ORDER = Object.keys(CAR_MATERIAL) as CarMaterialName[];

const smoothstep = (edge0: number, edge1: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - edge0) / (edge1 - edge0)));
  return u * u * (3 - 2 * u);
};

/**
 * Every part of a material as one plain geometry of positions, normals and a colour per vertex:
 * the paint's lower tone and the tyres' lighter sidewalls are vertex colours, so one material
 * draws each.
 */
function mergeMaterial(name: CarMaterialName, parts: BufferGeometry[]): BufferGeometry {
  const plain = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part;
    flat.deleteAttribute('uv');
    return flat;
  });
  const merged = mergeGeometries(plain);
  if (!merged) throw new Error(`The car's ${name} parts did not merge.`);
  const position = merged.getAttribute('position');
  const colours = new Float32Array(position.count * 3).fill(1);
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index);
    let shade = 1;
    if (name === 'paint') {
      const line = lowerToneLine(position.getX(index));
      shade =
        LOWER_TONE.shade +
        (1 - LOWER_TONE.shade) * smoothstep(line - LOWER_TONE.blend, line + LOWER_TONE.blend, y);
    } else if (name === 'rubber') {
      // Off the tread (the wheel's own x and y round its axle on z) is sidewall.
      const radius = Math.hypot(position.getX(index), y);
      if (radius < WHEEL_RADIUS - 0.01) shade = SIDEWALL_SHADE;
    }
    colours[index * 3] = shade;
    colours[index * 3 + 1] = shade;
    colours[index * 3 + 2] = shade;
  }
  merged.setAttribute('color', new BufferAttribute(colours, 3));
  return merged;
}

/**
 * One geometry of `parts`, its triangles grouped by material in `CAR_MATERIAL`'s order (a
 * material without parts has no group), with texture coordinates in metres projected across the
 * car for the carbon's weave, which is too fine for the projection's stretch to show.
 */
function level(parts: Parts): BufferGeometry {
  const present = MATERIAL_ORDER.filter((name) => parts[name]?.length);
  const merged = mergeGeometries(
    present.map((name) => mergeMaterial(name, parts[name]!)),
    true,
  );
  if (!merged) throw new Error('The car levels did not merge.');
  for (const [index, group] of merged.groups.entries()) {
    group.materialIndex = CAR_MATERIAL[present[index]!];
  }
  const position = merged.getAttribute('position');
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index++) {
    const z = position.getZ(index);
    uvs[index * 2] = position.getX(index) + 0.37 * z;
    uvs[index * 2 + 1] = position.getY(index) + 0.61 * z;
  }
  merged.setAttribute('uv', new BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
}

type Geometries = { near: BufferGeometry; far: BufferGeometry; wheel: BufferGeometry };
let geometries: Geometries | undefined;

/** The car's levels of detail and its wheel, made once and shared by every car. */
export function carGeometries(): Geometries {
  geometries ??= {
    near: level(nearParts()),
    far: level(farParts()),
    wheel: level(wheelParts(48)),
  };
  return geometries;
}

/** A material of the car: fades to a ghost by its opacity. */
export type CarMaterial = MeshStandardMaterial | MeshPhysicalMaterial;

/**
 * The car's materials in `CAR_MATERIAL`'s order, for `look`, all transparent so they can fade.
 * Their roughness steps apart so each reads on its own under the same light: satin paint under a
 * thin clearcoat (no candy gloss), dark grey carbon from matt in the weave's gaps to satin on its
 * tows' crowns, and matt rubber.
 */
export function carMaterials(colour: string, look: CarLook): CarMaterial[] {
  const rich = look === 'rich';
  const paint = rich
    ? new MeshPhysicalMaterial({
        color: colour,
        roughness: 0.34,
        metalness: 0,
        clearcoat: 0.5,
        clearcoatRoughness: 0.16,
        vertexColors: true,
        transparent: true,
      })
    : new MeshStandardMaterial({
        color: colour,
        roughness: 0.4,
        metalness: 0.05,
        vertexColors: true,
        transparent: true,
      });
  const weave = rich ? carbonWeaveTextures() : undefined;
  const carbon = new MeshStandardMaterial({
    color: rich ? COLOURS.carbon : COLOURS.plainCarbon,
    roughness: 0.62,
    metalness: 0.1,
    map: weave?.map ?? null,
    roughnessMap: weave?.roughness ?? null,
    transparent: true,
  });
  const metal = new MeshStandardMaterial({
    color: COLOURS.metal,
    roughness: 0.34,
    metalness: 0.9,
    transparent: true,
  });
  const rubber = new MeshStandardMaterial({
    color: COLOURS.rubber,
    roughness: 0.95,
    metalness: 0,
    vertexColors: true,
    transparent: true,
  });
  const light = new MeshStandardMaterial({
    color: '#2a0000',
    emissive: COLOURS.light,
    emissiveIntensity: LIGHT_INTENSITY * rearLightLevel('green'),
    roughness: 0.3,
    transparent: true,
  });
  return [paint, carbon, metal, rubber, light];
}

/** Where a car stands: on the ground at a track point, pitched nose up by `pitch` radians uphill. */
export type CarPlace = { x: number; y: number; z: number; heading: number; pitch: number };

/** One car on the track: what the scene places, fades and lights each frame. */
export type CarRig = {
  /** Stood on the track: position, heading and pitch. Hidden when the car is off screen. */
  object: Group;
  /** The body and the wheels, bobbed and rolled on the suspension. */
  body: LOD;
  wheels: InstancedMesh;
  /** The soft shadow on the ground under the car. */
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** In `CAR_MATERIAL`'s order. */
  materials: CarMaterial[];
  /** Where the car was last frame, and how its wheels and body have moved. */
  motion: {
    x: number;
    z: number;
    heading: number;
    spin: number;
    travelled: number;
    roll: number;
    placed: boolean;
  };
};

/** How fast the roll settles, per second. */
const ROLL_RATE = 6;

const matrix = new Matrix4();
const quaternion = new Quaternion();
const position = new Vector3();
const scale = new Vector3();
const AXLE_AXIS = new Vector3(0, 0, 1);

/** Sets the four wheels at their axles, turned `spin` radians, the rear pair stretched to their width. */
function setWheels(wheels: InstancedMesh, spin: number) {
  quaternion.setFromAxisAngle(AXLE_AXIS, -spin);
  for (const [index, [x, z]] of WHEEL_CENTRES.entries()) {
    position.set(x, WHEEL_RADIUS, z);
    scale.set(1, 1, x === AXLE.rear ? TYRE_WIDTH.rear / TYRE_WIDTH.front : 1);
    matrix.compose(position, quaternion, scale);
    wheels.setMatrixAt(index, matrix);
  }
  wheels.instanceMatrix.needsUpdate = true;
}

/**
 * One car in `colour` drawn for `look`, as a rig: a `LOD` that switches to its far level `lodM`
 * metres from the camera, under a group that stands on the track, with a contact shadow.
 */
export function carObject(colour: string, look: CarLook = 'rich', lodM = CAR_LOD_SWITCH_M): CarRig {
  const { near, far, wheel } = carGeometries();
  const materials = carMaterials(colour, look);
  const nearMesh = new Mesh(near, materials);
  const wheels = new InstancedMesh(wheel, materials, WHEEL_CENTRES.length);
  setWheels(wheels, 0);
  const nearLevel = new Group();
  nearLevel.add(nearMesh, wheels);
  const body = new LOD();
  body.addLevel(nearLevel, 0);
  body.addLevel(new Mesh(far, materials), lodM, 0.1);
  for (const mesh of [nearMesh, wheels, body.levels[1]!.object]) mesh.castShadow = true;
  const shadow = new Mesh(
    new PlaneGeometry(...CONTACT_SHADOW.metres).rotateX(-Math.PI / 2).translate(0, 0.012, 0),
    new MeshBasicMaterial({
      color: '#000000',
      alphaMap: contactShadowTexture(WHEEL_CENTRES),
      transparent: true,
      opacity: SHADOW_OPACITY,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  shadow.renderOrder = -1;
  const object = new Group();
  object.add(body, shadow);
  object.visible = false;
  return {
    object,
    body,
    wheels,
    shadow,
    materials,
    motion: { x: 0, z: 0, heading: 0, spin: 0, travelled: 0, roll: 0, placed: false },
  };
}

/**
 * Stands the car at `place` (or hides it), its body moved on from last frame: the wheels turn by
 * the distance driven, the body bobs along it and rolls into the corner the heading turned
 * through. A `snapped` frame (a seek) only moves the car, nothing turns.
 */
export function moveCar(
  rig: CarRig,
  place: CarPlace | undefined,
  seconds: number,
  snapped: boolean,
) {
  const { object, body, wheels, motion } = rig;
  object.visible = place !== undefined;
  if (!place) {
    motion.placed = false;
    return;
  }
  object.position.set(place.x, place.y, place.z);
  // Turned first, then pitched about its own width: the car's length is along its local `x`.
  object.rotation.set(0, -place.heading, place.pitch, 'YXZ');
  const moved = motion.placed && !snapped;
  const distance = moved ? Math.hypot(place.x - motion.x, place.z - motion.z) : 0;
  let turned = moved ? place.heading - motion.heading : 0;
  if (turned > Math.PI) turned -= Math.PI * 2;
  if (turned < -Math.PI) turned += Math.PI * 2;
  motion.x = place.x;
  motion.z = place.z;
  motion.heading = place.heading;
  motion.placed = true;
  motion.spin = (motion.spin + wheelSpin(distance, WHEEL_RADIUS)) % (Math.PI * 2);
  motion.travelled += distance;
  const roll = cornerRoll(turned, distance, seconds);
  motion.roll += (roll - motion.roll) * (snapped ? 1 : 1 - Math.exp(-ROLL_RATE * seconds));
  body.rotation.x = motion.roll;
  body.position.y = suspensionBob(motion.travelled);
  if (wheels.visible) setWheels(wheels, motion.spin);
}

/**
 * Moves every material's opacity `fade` of the way to `target` (1 solid, less a ghost); only an
 * opaque one writes depth, so a ghost never hides the track behind it. The shadow fades along.
 */
export function fadeCar(rig: CarRig, target: number, fade: number) {
  for (const material of rig.materials) {
    material.opacity += (target - material.opacity) * fade;
    if (Math.abs(target - material.opacity) < 0.005) material.opacity = target;
    material.depthWrite = material.opacity === 1;
  }
  rig.shadow.material.opacity = SHADOW_OPACITY * rig.materials[CAR_MATERIAL.paint]!.opacity;
}

/**
 * How near a T-cam, in metres along the ground, another car is gone (`hidden`) and back in full
 * (`shown`): one that overlaps the riding car would be drawn round the camera, a huge body
 * filling the bottom of the view.
 */
export const TCAM_CLEAR = { hidden: 4, shown: 8 } as const;

/**
 * The same round the chase camera, which stands behind the car it follows: only a car about where
 * the camera stands goes, so one alongside the followed car stays.
 */
export const CHASE_CLEAR = { hidden: 2, shown: 4.5 } as const;

/**
 * How much of another car a camera shows at `distance` metres from it, by its `clear` reach: none
 * close by, all clear of it.
 */
export function cameraShare(
  distance: number,
  clear: { hidden: number; shown: number } = TCAM_CLEAR,
): number {
  return smoothstep(clear.hidden, clear.shown, distance);
}

/** Whether the car has faded out altogether, so it need not be drawn. */
export const fadedOut = (rig: CarRig) => rig.materials[CAR_MATERIAL.paint]!.opacity === 0;

/** Burns the rear light as the track status asks (`rearLightLevel`). */
export function lightCar(rig: CarRig, trackStatus: string) {
  rig.materials[CAR_MATERIAL.light]!.emissiveIntensity =
    LIGHT_INTENSITY * rearLightLevel(trackStatus);
}

/** Frees what is the rig's own: its materials and its shadow; the geometries are shared. */
export function disposeCar(rig: CarRig) {
  for (const material of rig.materials) material.dispose();
  rig.shadow.geometry.dispose();
  rig.shadow.material.dispose();
}
