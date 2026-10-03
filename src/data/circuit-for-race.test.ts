import { describe, expect, it } from 'vitest';
import { circuitForRace } from './circuit-for-race';
import { generatedReplayFiles, readJson } from './replay-fixtures';
import { replayRaceSchema } from './replay-schema';

describe('circuitForRace', () => {
  it('maps the curated race venues to real outlines', () => {
    expect(circuitForRace('Yas Marina Circuit')).toMatchObject({
      name: 'Yas Marina Circuit',
      real: true,
    });
    expect(circuitForRace('Autódromo José Carlos Pace').real).toBe(true);
    expect(circuitForRace('Madring').name).toBe('Circuito de Madring');
    expect(circuitForRace('Baku City Circuit').name).toBe('Baku City Circuit');
    // Neither the location nor the hyphenated name would match this spelling on its own.
    expect(circuitForRace('Circuit Gilles Villeneuve').name).toBe('Circuit Gilles-Villeneuve');
  });

  it('matches an unknown spelling by location, ignoring accents and case', () => {
    expect(circuitForRace('autodromo hermanos rodriguez, MEXICO CITY').real).toBe(true);
    expect(circuitForRace('Something at Silverstone').name).toBe('Silverstone Circuit');
  });

  it('gives the Onboard view the lap and pit lane lengths and the track width', () => {
    const monza = circuitForRace('Autodromo Nazionale di Monza');
    expect(monza.lengthM).toBeGreaterThan(5000);
    expect(monza.pitLengthM).toBeGreaterThan(0);
    expect(monza.pitLengthM).toBeLessThan(monza.lengthM / 4);
    expect(monza.widthM).toBe(12);
    expect(circuitForRace('Circuit de Monaco').widthM).toBeLessThan(12);
    expect(circuitForRace('Nowhere Raceway').pitLengthM).toBeGreaterThan(0);
  });

  it('falls back to the invented circuit when nothing matches', () => {
    const circuit = circuitForRace('Nowhere Raceway');
    expect(circuit.real).toBe(false);
    expect(circuit.name).toBe('Aster Park');
  });

  it('finds a real outline for every generated race', () => {
    const files = generatedReplayFiles();
    if (files.length === 0) return;
    for (const file of files) {
      const race = replayRaceSchema.parse(readJson(file));
      expect(circuitForRace(race.circuit).real, race.circuit).toBe(true);
    }
  });
});
