import type { ComponentMeta } from '../types';

const meta = {
  slug: 'stint-bar',
  name: 'Stint Bar',
  category: 'pit-lane',
  description:
    "A car's tyre strategy as one bar: a segment per stint in its compound colour, filling up to the lap the car is on.",
  registryName: 'stint-bar',
  dependencies: [],
  status: 'stable',
  notes: [
    'The fill edge is a CSS transition of a clip over the laps still to come, not a motion component, so a grid of twenty bars updating together stays cheap. It uses the shared easing and duration tokens and stops moving under reduced motion.',
    'A stint with no compound draws neutral with a question mark: stint cuts and compounds often come from different sources, and a missing compound should not hide the stint.',
  ],
} satisfies ComponentMeta;

export default meta;
