import { describe, expect, it } from 'vitest';
import { circuitForRace } from './circuit-for-race';
import { CIRCUITS } from './circuits';
import { STREET_CIRCUIT_IDS, isStreetCircuit } from './track-widths';

const STREET = ['mc-1929', 'az-2016', 'sg-2008', 'us-2023', 'sa-2021', 'us-2022', 'es-2026'];

describe('street circuits', () => {
  it('names only circuits the generated dataset has', () => {
    const ids = new Set(CIRCUITS.map((circuit) => circuit.id));
    for (const id of STREET_CIRCUIT_IDS) expect(ids.has(id)).toBe(true);
  });

  it('flags the street circuits of the generated data, and no other', () => {
    for (const circuit of CIRCUITS) {
      expect(circuitForRace(circuit.name).street, circuit.id).toBe(STREET.includes(circuit.id));
    }
    expect(circuitForRace('Circuit de Monaco').street).toBe(true);
    expect(circuitForRace('Las Vegas Strip Street Circuit').street).toBe(true);
    expect(circuitForRace('Autodromo Nazionale di Monza').street).toBe(false);
    expect(circuitForRace('Albert Park Grand Prix Circuit').street).toBe(false);
  });

  it('keeps Aster Park and an unknown id permanent', () => {
    expect(circuitForRace('Nowhere Raceway').street).toBe(false);
    expect(isStreetCircuit(undefined)).toBe(false);
    expect(isStreetCircuit('xx-0000')).toBe(false);
  });
});
