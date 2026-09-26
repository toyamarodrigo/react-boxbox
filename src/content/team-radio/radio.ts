import type { TeamRadioWord } from '@/registry/boxbox/ui/team-radio';

/**
 * The demo message, "Box, box.", as a synthesised clip: no real recording and no real voice. The
 * envelope is one level per frame of the promo it was cut for, measured off that clip at 60 fps,
 * and the word times are the frames each word was placed on there, in seconds from the start.
 */
export const TEAM_RADIO_SRC = '/audio/team-radio-box-box.wav';

export const TEAM_RADIO_ENVELOPE_RATE = 60;

export const TEAM_RADIO_ENVELOPE: number[] = [
  0.288, 0.143, 0.068, 0.051, 0.233, 0.334, 0.322, 0.163, 0.04, 0.042, 0.06, 0.081, 0.051, 0.304,
  0.884, 0.98, 1.0, 0.993, 0.966, 0.933, 0.92, 0.922, 0.837, 0.791, 0.571, 0.174, 0.042, 0.091,
  0.287, 0.204, 0.384, 0.416, 0.344, 0.368, 0.196, 0.093, 0.044, 0.043, 0.042, 0.044, 0.047, 0.125,
  0.79, 0.934, 0.905, 0.888, 0.847, 0.858, 0.872, 0.833, 0.733, 0.702, 0.558, 0.189, 0.042, 0.044,
  0.33, 0.188, 0.335, 0.448, 0.446, 0.404, 0.391, 0.351, 0.331, 0.309, 0.204, 0.077, 0.039, 0.039,
  0.044, 0.044, 0.045, 0.041, 0.046, 0.042, 0.082, 0.04, 0.043, 0.322, 0.206, 0.127, 0.055, 0.04,
  0.036, 0.031, 0.028, 0.024,
];

export const TEAM_RADIO_WORDS: TeamRadioWord[] = [
  { text: 'Box,', at: 0.217 },
  { text: 'box.', at: 0.683 },
];
