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
