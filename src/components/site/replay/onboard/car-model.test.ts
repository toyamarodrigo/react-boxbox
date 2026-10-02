import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry, Mesh, Vector3 } from 'three';
import { CAR_LENGTH_M } from '@/data/onboard-frame';
import {
  CAR_HEIGHT_M,
  CAR_LOD_SWITCH_M,
  CAR_MATERIAL,
  CAR_WIDTH_M,
  carGeometries,
  carObject,
  loft,
} from './car-model';

const triangles = (geometry: BufferGeometry) => geometry.getAttribute('position').count / 3;

describe('carGeometries', () => {
  it('fills a formula car’s length, width and height, standing on the ground', () => {
    for (const geometry of Object.values(carGeometries())) {
      const size = new Box3().setFromObject(new Mesh(geometry));
      expect(size.max.x - size.min.x).toBeCloseTo(CAR_LENGTH_M, 1);
      expect(size.max.z - size.min.z).toBeCloseTo(CAR_WIDTH_M, 1);
      expect(size.max.y).toBeCloseTo(CAR_HEIGHT_M, 1);
      expect(size.min.y).toBeCloseTo(0, 2);
      expect(size.min.x + size.max.x).toBeCloseTo(0, 1);
    }
  });

  it('splits every triangle into the bodywork or the carbon group', () => {
    for (const geometry of Object.values(carGeometries())) {
      const groups = geometry.groups.map((group) => group.materialIndex);
      expect(groups).toEqual([CAR_MATERIAL.body, CAR_MATERIAL.carbon]);
      const covered = geometry.groups.reduce((sum, group) => sum + group.count, 0);
      expect(covered).toBe(geometry.getAttribute('position').count);
    }
  });

  it('makes the far level of detail much lighter than the near one', () => {
    const { near, far } = carGeometries();
    expect(triangles(near)).toBeLessThan(5000);
    expect(triangles(far)).toBeLessThan(triangles(near) / 4);
  });
});

describe('carObject', () => {
  it('switches to the far level past the switch distance, with the team colour', () => {
    const { object, materials } = carObject('#ff8000');
    expect(object.levels.map((level) => level.distance)).toEqual([0, CAR_LOD_SWITCH_M]);
    expect(object.levels.every((level) => level.object instanceof Mesh)).toBe(true);
    expect(materials[CAR_MATERIAL.body]!.color.getHexString()).toBe('ff8000');
    expect(materials.every((material) => material.transparent)).toBe(true);
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
