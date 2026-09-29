import { FICTIONAL_CIRCUIT } from '../content/track-map/circuit';
import { CIRCUITS } from './circuits';

export type ReplayCircuit = {
  d: string;
  viewBox: string;
  name: string;
  /** The approximate pit lane: an open `d`, and where it leaves and rejoins the lap. */
  pit: { entry: number; exit: number; d: string };
  /** True when the outline is a real venue from the generated dataset, false for Aster Park. */
  real: boolean;
};

/**
 * The names the replay data uses for the curated races, keyed to the outline ids in
 * `circuits.ts`. The source API and the outline dataset spell venues differently, so an
 * explicit map beats guessing; unknown names still get a best-effort match by location.
 */
const BY_RACE_CIRCUIT_NAME: Record<string, string> = {
  'Albert Park Grand Prix Circuit': 'au-1953',
  'Autódromo José Carlos Pace': 'br-1940',
  'Baku City Circuit': 'az-2016',
  'Las Vegas Strip Street Circuit': 'us-2023',
  Madring: 'es-2026',
  'Yas Marina Circuit': 'ae-2009',
};

/** Lower-case and strip accents, so "Autódromo" and "Autodromo" compare equal. */
const normalise = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const FALLBACK: ReplayCircuit = {
  d: FICTIONAL_CIRCUIT.d,
  viewBox: FICTIONAL_CIRCUIT.viewBox,
  name: FICTIONAL_CIRCUIT.name,
  pit: FICTIONAL_CIRCUIT.pit,
  real: false,
};

/** The outline to draw a race on: the real venue when the dataset has it, Aster Park otherwise. */
export function circuitForRace(circuitName: string): ReplayCircuit {
  const explicitId = BY_RACE_CIRCUIT_NAME[circuitName];
  const wanted = normalise(circuitName);
  const match =
    CIRCUITS.find((circuit) => circuit.id === explicitId) ??
    CIRCUITS.find((circuit) => {
      const location = normalise(circuit.location);
      const name = normalise(circuit.name);
      return wanted.includes(location) || wanted.includes(name) || name.includes(wanted);
    });
  return match
    ? { d: match.d, viewBox: match.viewBox, name: match.name, pit: match.pit, real: true }
    : FALLBACK;
}
