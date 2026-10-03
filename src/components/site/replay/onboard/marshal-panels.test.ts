import { describe, expect, it } from 'vitest';
import { Color, InstancedMesh, type Mesh, MeshLambertMaterial, type PlaneGeometry } from 'three';
import { circuitForRace } from '@/data/circuit-for-race';
import type { MarshalLight } from '@/data/onboard-frame';
import { MARSHAL_PANEL_SPACING_M, buildMarshalPanels, setMarshalLights } from './marshal-panels';
import { pointAt, trackModel } from './track';

describe('buildMarshalPanels', () => {
  const track = trackModel(circuitForRace('Autodromo Nazionale di Monza'));
  const panels = buildMarshalPanels(track);

  it('stands a panel about every 160 m round the lap, in order from the line', () => {
    expect(MARSHAL_PANEL_SPACING_M).toBe(160);
    const wanted = Math.round(track.lap.length / MARSHAL_PANEL_SPACING_M);
    // A panel whose footprint would reach another part of the lap is left out.
    expect(panels.shares.length).toBeGreaterThanOrEqual(wanted - 2);
    expect(panels.shares.length).toBeLessThanOrEqual(wanted);
    for (const [index, share] of panels.shares.entries()) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThan(1);
      if (index > 0) {
        expect(share).toBeGreaterThan(panels.shares[index - 1]!);
        // No gap so long that no panel is in view down it.
        expect((share - panels.shares[index - 1]!) * track.lap.length).toBeLessThan(250);
      }
    }
  });

  it('stands about as many panels on Monaco and Spa as their laps are long', () => {
    for (const name of ['Circuit de Monaco', 'Circuit de Spa-Francorchamps']) {
      const other = trackModel(circuitForRace(name));
      const wanted = Math.round(other.lap.length / MARSHAL_PANEL_SPACING_M);
      const { shares } = buildMarshalPanels(other);
      expect(shares.length).toBeGreaterThanOrEqual(wanted - 3);
      expect(shares.length).toBeLessThanOrEqual(wanted);
    }
  });

  it('makes each lit face 1.6 m wide and 1 m tall', () => {
    const geometry = panels.faces!.geometry as PlaneGeometry;
    expect(geometry.parameters.width).toBe(1.6);
    expect(geometry.parameters.height).toBe(1);
  });

  it('keeps every panel on the low quality level, lit more cheaply', () => {
    const lite = buildMarshalPanels(track, undefined, { lite: true });
    expect(lite.shares).toEqual(panels.shares);
    const housing = lite.group.children[0] as Mesh;
    expect(housing.material).toBeInstanceOf(MeshLambertMaterial);
  });

  it('draws every lit face in one instanced mesh, dark to begin with', () => {
    const faces = panels.faces!;
    expect(faces).toBeInstanceOf(InstancedMesh);
    expect(faces.count).toBe(panels.shares.length);
    expect(panels.shown.every((light) => light === 'off')).toBe(true);
  });

  it('stands each panel off the ground where the lap is, so it follows the elevation', () => {
    const matrix = panels.faces!.instanceMatrix.array;
    for (const [index, share] of panels.shares.entries()) {
      const ground = pointAt(track.lap, share * track.lap.nominal).y;
      const y = matrix[index * 16 + 13]!;
      expect(y - ground).toBeGreaterThan(1.5);
      expect(y - ground).toBeLessThan(2.5);
    }
  });

  it('changes only the faces whose light changed', () => {
    const lit = buildMarshalPanels(track);
    const faces = lit.faces!;
    const lights = lit.shares.map((_, index): MarshalLight => (index === 2 ? 'yellow' : 'off'));
    setMarshalLights(lit, lights);
    expect(lit.shown[2]).toBe('yellow');
    const colour = new Color();
    faces.getColorAt(2, colour);
    expect(colour.r).toBeGreaterThan(0.9);
    faces.getColorAt(1, colour);
    expect(colour.r).toBeLessThan(0.1);
    const version = faces.instanceColor!.version;
    setMarshalLights(lit, lights);
    expect(faces.instanceColor!.version).toBe(version);
  });
});
