import { FICTIONAL_CIRCUIT } from '../content/track-map/circuit';
import { CIRCUIT_ELEVATION } from './circuit-elevation';
import { CIRCUITS } from './circuits';
import type { ElevationSource } from './elevation-sources';
import { outlinePoints, polylineLength } from '../lib/svg-outline';
import { CONSTANT_SPEED, type SpeedProfile } from './speed-profile';
import { isStreetCircuit, trackWidthFor } from './track-widths';

export type ReplayCircuit = {
  d: string;
  viewBox: string;
  name: string;
  /** The approximate pit lane: an open `d`, and where it leaves and rejoins the lap. */
  pit: { entry: number; exit: number; d: string };
  /**
   * How a lap's time is shared out along it (ADR 0005), for every view that places a car. Aster
   * Park is drawn with curves the profile builder does not read, so it runs at constant speed.
   */
  profile: SpeedProfile;
  /** True when the outline is a real venue from the generated dataset, false for Aster Park. */
  real: boolean;
  /** The lap's length in metres: official for a real venue, invented for Aster Park. */
  lengthM: number;
  /** The pit lane's length in metres, measured on the outline at the lap's scale. */
  pitLengthM: number;
  /** How wide the Onboard view draws the track, in metres (`track-widths.ts`). */
  widthM: number;
  /**
   * True when the Onboard view dresses the circuit as a street circuit, with walls and buildings
   * instead of run-off and grass (`track-widths.ts`). False for Aster Park.
   */
  street: boolean;
  /**
   * The racing line the Onboard view drives (`circuits.ts`): metres to the left of travel,
   * evenly spaced round the lap. Empty for Aster Park, whose cars keep to the outline.
   */
  racingLine: readonly number[];
  /**
   * The lap's height for the Onboard view (`circuit-elevation.ts`): metres above its lowest point,
   * evenly spaced round the lap. Empty, so flat, where there is none, and for Aster Park.
   */
  elevation: readonly number[];
  /** Where the elevation comes from, for the caption's credit; none without one. */
  elevationSource?: ElevationSource;
};

/** The pit lane's length in metres: the outline's scale is the lap length over its drawn length. */
function pitLengthM(d: string, pitD: string, lengthM: number): number {
  const lap = polylineLength(outlinePoints(d), true);
  return lap === 0 ? 0 : (lengthM * polylineLength(outlinePoints(pitD), false)) / lap;
}

/**
 * The names the replay data uses for the curated races, keyed to the outline ids in
 * `circuits.ts`. The source API and the outline dataset spell venues differently, so an
 * explicit map beats guessing; unknown names still get a best-effort match by location.
 */
const BY_RACE_CIRCUIT_NAME: Record<string, string> = {
  'Albert Park Grand Prix Circuit': 'au-1953',
  'Autodromo Nazionale di Monza': 'it-1922',
  'Autódromo José Carlos Pace': 'br-1940',
  'Baku City Circuit': 'az-2016',
  'Circuit de Barcelona-Catalunya': 'es-1991',
  'Circuit de Monaco': 'mc-1929',
  'Circuit de Spa-Francorchamps': 'be-1925',
  'Circuit Gilles Villeneuve': 'ca-1978',
  'Circuit Park Zandvoort': 'nl-1948',
  Hungaroring: 'hu-1986',
  'Las Vegas Strip Street Circuit': 'us-2023',
  Madring: 'es-2026',
  'Miami International Autodrome': 'us-2022',
  'Red Bull Ring': 'at-1969',
  'Shanghai International Circuit': 'cn-2004',
  'Silverstone Circuit': 'gb-1948',
  'Suzuka Circuit': 'jp-1962',
  'Yas Marina Circuit': 'ae-2009',
};

/** Lower-case and strip accents, so "Autódromo" and "Autodromo" compare equal. */
const normalise = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Aster Park is invented, and so is its length: about a modern permanent circuit's. */
const ASTER_PARK_LENGTH_M = 4800;

const FALLBACK: ReplayCircuit = {
  d: FICTIONAL_CIRCUIT.d,
  viewBox: FICTIONAL_CIRCUIT.viewBox,
  name: FICTIONAL_CIRCUIT.name,
  pit: FICTIONAL_CIRCUIT.pit,
  profile: CONSTANT_SPEED,
  real: false,
  lengthM: ASTER_PARK_LENGTH_M,
  pitLengthM: pitLengthM(FICTIONAL_CIRCUIT.d, FICTIONAL_CIRCUIT.pit.d, ASTER_PARK_LENGTH_M),
  widthM: trackWidthFor(undefined),
  street: false,
  racingLine: [],
  elevation: [],
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
  const elevation = match && CIRCUIT_ELEVATION[match.id];
  return match
    ? {
        d: match.d,
        viewBox: match.viewBox,
        name: match.name,
        pit: match.pit,
        profile: match.profile,
        real: true,
        lengthM: match.lengthM,
        pitLengthM: pitLengthM(match.d, match.pit.d, match.lengthM),
        widthM: trackWidthFor(match.id),
        street: isStreetCircuit(match.id),
        racingLine: match.racingLine,
        elevation: elevation?.heights ?? [],
        elevationSource: elevation?.source,
      }
    : FALLBACK;
}
