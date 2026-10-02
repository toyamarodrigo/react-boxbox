import { describe, expect, it } from 'vitest';
import { ConeGeometry, type Group, InstancedMesh, Mesh } from 'three';
import { circuitForRace } from '@/data/circuit-for-race';
import { CIRCUITS } from '@/data/circuits';
import { buildScenery } from './scenery';
import { trackModel } from './track';

const meshes = (group: Group) => {
  const found: Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
};
const hasTrees = (group: Group) =>
  meshes(group).some(
    (mesh) => mesh instanceof InstancedMesh && mesh.geometry instanceof ConeGeometry,
  );

describe('buildScenery', () => {
  it('builds every circuit in a handful of draw calls', () => {
    for (const circuit of [...CIRCUITS.map((item) => item.name), 'Nowhere Raceway']) {
      const replay = circuitForRace(circuit);
      const group = buildScenery(trackModel(replay));
      const all = meshes(group);
      expect(all.length, circuit).toBeLessThanOrEqual(14);
      for (const mesh of all) {
        const positions = mesh.geometry.getAttribute('position');
        expect(positions.count, circuit).toBeGreaterThan(0);
        for (let index = 0; index < positions.array.length; index += 97) {
          expect(Number.isFinite(positions.array[index]), circuit).toBe(true);
        }
      }
    }
  });

  it('gives a street circuit buildings and no trees, a permanent one trees', () => {
    expect(hasTrees(buildScenery(trackModel(circuitForRace('Circuit de Monaco'))))).toBe(false);
    expect(hasTrees(buildScenery(trackModel(circuitForRace('Autodromo Nazionale di Monza'))))).toBe(
      true,
    );
  });
});
