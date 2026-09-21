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
  });

  it('matches an unknown spelling by location, ignoring accents and case', () => {
    expect(circuitForRace('autodromo hermanos rodriguez, MEXICO CITY').real).toBe(true);
    expect(circuitForRace('Something at Silverstone').name).toBe('Silverstone Circuit');
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
