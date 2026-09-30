import type { ComponentMeta } from '../types';

const meta = {
  slug: 'standings',
  name: 'Standings',
  category: 'timing',
  description:
    'A championship table of drivers or teams: points, what the race gained, and the change of place, with rows that move when the order does.',
  registryName: 'standings',
  dependencies: ['motion'],
  status: 'stable',
  notes: [
    'The table is data only and does not score a race. Pass the entries ranked, with `position`, `points`, and optionally `gained` (points scored in the race on screen, shown as `+18`) and `positionChange` (places up or down against the standings before the race, shown as ▲2 / ▼1). A driver row names the driver by code, a team row by team name.',
    'Feed it projected standings while a race runs — the standings before the race plus the points each place is worth now — and the rows move to their new places with a spring while the points roll. The demo on this page projects them on the fictional grid; the Replay page does the same for real races and swaps in the official standings at the chequered flag.',
    'Half points print with one decimal. Under reduced motion the rows and the figures change in place.',
    'It is an ordered list with one sentence of real text per row; the columns are painted and hidden behind it. It is not a live region: projected standings can change every few seconds.',
  ],
} satisfies ComponentMeta;

export default meta;
