import type { ComponentMeta } from '../types';

const meta = {
  slug: 'gap-chart',
  name: 'Gap Chart',
  category: 'timing',
  description:
    'Gap to the leader across the race: laps along the bottom, seconds behind down the side, and the leader pinned to zero along the top the way a broadcast draws it.',
  registryName: 'gap-chart',
  dependencies: ['recharts'],
  status: 'stable',
  notes: [
    "Drawn with Recharts through shadcn's own `chart` item, the decision recorded in ADR 0001. It is the only item in this registry that carries a chart library, so installing the rest stays light; install `chart` with the shadcn CLI before this item.",
    'No line animates. The chart is redrawn every time a car completes a lap, and a line that redraws itself from the left on each of those reads as a glitch rather than as motion. The component is memoised, so a page with a clock running at ten frames a second only redraws it when a lap, the data or the emphasis changes.',
    'The y axis is reversed: zero, the leader, sits along the top and the field hangs below it. A lap a car has no time for breaks its line rather than being joined across.',
  ],
} satisfies ComponentMeta;

export default meta;
