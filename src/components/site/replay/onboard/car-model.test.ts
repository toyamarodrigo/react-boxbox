import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry, Mesh, MeshPhysicalMaterial, Vector3 } from 'three';
import { CAR_LENGTH_M } from '@/data/onboard-frame';
import {
  CAR_HEIGHT_M,
  CAR_LOD_SWITCH_M,
  CAR_MATERIAL,
  CAR_WIDTH_M,
  carGeometries,
  carObject,
  fadeCar,
  lightCar,
  moveCar,
} from './car-model';
import { loft } from './car-shapes';

const triangles = (geometry: BufferGeometry) => geometry.getAttribute('position').count / 3;

describe('carGeometries', () => {
  it('fills a formula car’s length, width and height, standing on the ground', () => {
    // The body and wheels; the contact shadow spreads past the car.
    const { body } = carObject('#ff8000');
    const size = new Box3().setFromObject(body);
    expect(size.max.x - size.min.x).toBeCloseTo(CAR_LENGTH_M, 1);
    expect(size.max.z - size.min.z).toBeCloseTo(CAR_WIDTH_M, 1);
    expect(size.max.y).toBeCloseTo(CAR_HEIGHT_M, 1);
    expect(size.min.y).toBeCloseTo(0, 2);
    expect(size.min.x + size.max.x).toBeCloseTo(0, 1);
    // The far level alone, wheels included, is the same car.
    const far = new Box3().setFromObject(new Mesh(carGeometries().far));
    expect(far.max.x - far.min.x).toBeCloseTo(CAR_LENGTH_M, 1);
    expect(far.max.z - far.min.z).toBeCloseTo(CAR_WIDTH_M, 1);
    expect(far.min.y).toBeCloseTo(0, 2);
  });

  it('groups every triangle by material, each material once, in order', () => {
    for (const geometry of Object.values(carGeometries())) {
      const groups = geometry.groups.map((group) => group.materialIndex!);
      expect(groups).toEqual([...groups].sort((a, b) => a - b));
      expect(new Set(groups).size).toBe(groups.length);
      const covered = geometry.groups.reduce((sum, group) => sum + group.count, 0);
      expect(covered).toBe(geometry.getAttribute('position').count);
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count);
    }
    const { near, far, wheel } = carGeometries();
    expect(near.groups.map((group) => group.materialIndex)).toContain(CAR_MATERIAL.light);
    expect(far.groups.map((group) => group.materialIndex)).toContain(CAR_MATERIAL.light);
    expect(wheel.groups.map((group) => group.materialIndex)).toEqual([
      CAR_MATERIAL.metal,
      CAR_MATERIAL.rubber,
    ]);
  });

  it('paints the lower bodywork a darker tone and the tyres’ sidewalls lighter', () => {
    const { near, wheel } = carGeometries();
    const shades = (geometry: BufferGeometry, materialIndex: number) => {
      const group = geometry.groups.find((item) => item.materialIndex === materialIndex)!;
      const colour = geometry.getAttribute('color');
      const position = geometry.getAttribute('position');
      const out: { y: number; shade: number }[] = [];
      for (let index = group.start; index < group.start + group.count; index++) {
        out.push({ y: position.getY(index), shade: colour.getX(index) });
      }
      return out;
    };
    const paint = shades(near, CAR_MATERIAL.paint);
    expect(paint.filter(({ y }) => y > 0.4).every(({ shade }) => shade === 1)).toBe(true);
    expect(paint.filter(({ y }) => y < 0.15).every(({ shade }) => shade < 0.5)).toBe(true);
    const rubber = shades(wheel, CAR_MATERIAL.rubber);
    expect(new Set(rubber.map(({ shade }) => shade)).size).toBe(2);
  });

  it('keeps the near level within budget and the far level far lighter', () => {
    const { near, far, wheel } = carGeometries();
    expect(triangles(near) + triangles(wheel) * 4).toBeLessThan(20_000);
    expect(triangles(near)).toBeGreaterThan(5000);
    expect(triangles(far)).toBeLessThan(1500);
  });
});

describe('carObject', () => {
  it('switches to the far level past the switch distance, with the team colour', () => {
    const { body, materials, wheels } = carObject('#ff8000');
    expect(body.levels.map((level) => level.distance)).toEqual([0, CAR_LOD_SWITCH_M]);
    expect(materials[CAR_MATERIAL.paint]!.color.getHexString()).toBe('ff8000');
    expect(materials.every((material) => material.transparent)).toBe(true);
    expect(wheels.count).toBe(4);
    expect(wheels.castShadow).toBe(true);
  });

  it('paints a clearcoat only for the rich look', () => {
    expect(carObject('#ff8000', 'rich').materials[CAR_MATERIAL.paint]).toBeInstanceOf(
      MeshPhysicalMaterial,
    );
    expect(carObject('#ff8000', 'plain').materials[CAR_MATERIAL.paint]).not.toBeInstanceOf(
      MeshPhysicalMaterial,
    );
    expect(carObject('#ff8000', 'plain').materials[CAR_MATERIAL.carbon]!.map).toBeNull();
  });

  it('fades every material and the shadow to a ghost, writing depth only when solid', () => {
    const rig = carObject('#ff8000');
    fadeCar(rig, 0.35, 1);
    expect(rig.materials.every((material) => material.opacity === 0.35)).toBe(true);
    expect(rig.materials.every((material) => material.depthWrite === false)).toBe(true);
    expect(rig.shadow.material.opacity).toBeCloseTo(0.6 * 0.35);
    fadeCar(rig, 1, 1);
    expect(rig.materials.every((material) => material.depthWrite === true)).toBe(true);
  });

  it('burns the rear light brighter under a safety car', () => {
    const rig = carObject('#ff8000');
    lightCar(rig, 'green');
    const idle = rig.materials[CAR_MATERIAL.light]!.emissiveIntensity;
    lightCar(rig, 'sc');
    expect(rig.materials[CAR_MATERIAL.light]!.emissiveIntensity).toBeGreaterThan(idle);
  });
});

describe('moveCar', () => {
  const place = (x: number, heading: number) => ({ x, y: 0, z: 0, heading, pitch: 0 });

  it('stands the car, hides it without a place, and spins the wheels by the distance driven', () => {
    const rig = carObject('#ff8000');
    moveCar(rig, place(0, 0), 1 / 60, true);
    expect(rig.object.visible).toBe(true);
    expect(rig.motion.spin).toBe(0);
    moveCar(rig, place(0.36, 0), 1 / 60, false);
    expect(rig.motion.spin).toBeCloseTo(1);
    expect(rig.motion.travelled).toBeCloseTo(0.36);
    moveCar(rig, undefined, 1 / 60, false);
    expect(rig.object.visible).toBe(false);
  });

  it('does not turn the wheels or roll on a seek', () => {
    const rig = carObject('#ff8000');
    moveCar(rig, place(0, 0), 1 / 60, true);
    moveCar(rig, place(500, 1), 1 / 60, true);
    expect(rig.motion.spin).toBe(0);
    expect(rig.body.rotation.x).toBe(0);
  });

  it('rolls the body out of a corner and settles back on a straight', () => {
    const rig = carObject('#ff8000');
    moveCar(rig, place(0, 0), 1 / 60, true);
    for (let frame = 1; frame <= 30; frame++)
      moveCar(rig, place(frame, frame * 0.01), 1 / 60, false);
    expect(rig.body.rotation.x).toBeLessThan(0);
    for (let frame = 31; frame <= 90; frame++) moveCar(rig, place(frame, 0.3), 1 / 60, false);
    expect(Math.abs(rig.body.rotation.x)).toBeLessThan(0.0005);
  });
});

describe('loft', () => {
  it('turns every normal out of the tube and its caps to the ends', () => {
    const stations = [
      { x: 1, z: 0.5, halfWidth: 0.2, bottom: 0, top: 0.4 },
      { x: 0, z: 0.5, halfWidth: 0.3, bottom: 0, top: 0.6 },
      { x: -1, z: 0.5, halfWidth: 0.1, bottom: 0.1, top: 0.3 },
    ];
    for (const sides of [4, 16]) {
      const { tube, front, back } = loft(stations, sides);
      const positions = tube.getAttribute('position');
      const normals = tube.getAttribute('normal');
      for (let index = 0; index < positions.count; index++) {
        const station = stations[Math.floor(index / sides)]!;
        const out = new Vector3(
          0,
          positions.getY(index) - (station.top + station.bottom) / 2,
          positions.getZ(index) - station.z,
        );
        const normal = new Vector3().fromBufferAttribute(normals, index);
        expect(normal.dot(out)).toBeGreaterThan(0);
      }
      expect(front.getAttribute('normal').getX(0)).toBeCloseTo(1);
      expect(back.getAttribute('normal').getX(0)).toBeCloseTo(-1);
    }
  });
});
