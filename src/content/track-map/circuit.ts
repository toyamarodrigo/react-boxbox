import type { TrackSector } from '@/registry/boxbox/lib/types';

/**
 * Aster Park, an invented circuit drawn for this project.
 *
 * It is not a copy or an approximation of any real venue, so it is safe to use as the
 * default in any context. Real outlines live in `src/data/circuits.ts`, generated from
 * public GeoJSON by `bun run circuits:build`.
 *
 * Fourteen numbered corners: a long start/finish straight along the bottom, a fast
 * chicane at turns 4 and 5, and a hairpin at turn 7. Start/finish is the first point
 * of the path, so a marker at progress 0 sits on the line.
 */
const d = [
  'M 140 520',
  'L 690 520',
  'C 790 520 866 512 900 470',
  'C 934 428 906 382 856 372',
  'C 806 362 742 372 700 350',
  'C 658 328 654 292 686 268',
  'C 718 244 764 248 790 226',
  'C 826 196 890 196 916 160',
  'C 942 124 918 78 866 74',
  'C 814 70 780 104 744 120',
  'C 700 140 650 132 620 104',
  'C 590 76 540 70 500 92',
  'C 460 114 452 160 414 178',
  'C 366 200 300 186 262 152',
  'C 214 108 140 120 116 176',
  'C 92 232 130 288 176 316',
  'C 222 344 268 372 262 420',
  // The last corner feeds the straight tangentially: the final control point sits
  // level with the line, so the lap closes without a kink at start/finish.
  'C 256 470 200 470 160 480',
  'C 120 490 100 520 140 520',
  'Z',
].join(' ');

export const FICTIONAL_CIRCUIT = {
  d,
  viewBox: '0 0 1000 600',
  name: 'Aster Park',
} as const;

/** Three equal sectors, the way a race director would cut this lap up. */
export const FICTIONAL_SECTORS: [TrackSector, TrackSector, TrackSector] = [
  { start: 0, end: 0.33 },
  { start: 0.33, end: 0.66 },
  { start: 0.66, end: 1 },
];
