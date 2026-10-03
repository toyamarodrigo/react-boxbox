/**
 * How wide the Onboard view draws a circuit's track, in metres: one width for the whole lap,
 * where a real track narrows and widens along it. The outline dataset has no widths, so this is
 * hand-kept data next to the generated circuits, keyed by their ids in `circuits.ts`. Add an
 * override only for a venue the default makes look wrong.
 */

/** The width of a circuit without an override: about a modern permanent circuit's. */
export const DEFAULT_TRACK_WIDTH_M = 12;

const TRACK_WIDTHS_M: Readonly<Record<string, number>> = {
  // Monaco: a street circuit far narrower than a purpose-built one.
  'mc-1929': 9,
};

/** The track width for a circuit id; the default for an unknown id or none. */
export function trackWidthFor(circuitId: string | undefined): number {
  return (circuitId === undefined ? undefined : TRACK_WIDTHS_M[circuitId]) ?? DEFAULT_TRACK_WIDTH_M;
}

/**
 * The circuits the Onboard view dresses as street circuits: concrete walls with catch fencing
 * right at the track edge and generic buildings behind, no grass run-off. Hand-kept like the
 * widths, keyed by the ids in `circuits.ts`. A temporary circuit laid out on public roads or
 * round a car park counts; a permanent circuit in a park (Albert Park, Montreal) does not.
 */
const STREET_CIRCUITS: ReadonlySet<string> = new Set([
  'mc-1929', // Monaco
  'az-2016', // Baku
  'sg-2008', // Marina Bay, Singapore
  'us-2023', // Las Vegas
  'sa-2021', // Jeddah
  'us-2022', // Miami: a temporary circuit round the stadium, walled all the way
  'es-2026', // Madring: partly on the roads round the exhibition grounds
]);

/** True when the Onboard view draws a circuit id as a street circuit; false for none. */
export function isStreetCircuit(circuitId: string | undefined): boolean {
  return circuitId !== undefined && STREET_CIRCUITS.has(circuitId);
}

/** The ids `isStreetCircuit` holds, for the data test. */
export const STREET_CIRCUIT_IDS: readonly string[] = [...STREET_CIRCUITS];
