import type { ComponentMeta } from '../types';

const meta = {
  slug: 'track-map',
  name: 'Track Map',
  category: 'race-control',
  description:
    'A geometry-agnostic circuit map: you give it an SVG path, it colours the sectors with the flag in force and slides a marker per car round the lap.',
  registryName: 'track-map',
  dependencies: [],
  status: 'stable',
  notes: [
    'Any outline works. Feed a GeoJSON LineString straight into pathFromPoints(coordinates) and it returns a d and a matching viewBox, with the y axis flipped so north points up. Public collections of circuit geometry exist, such as bacinger/f1-circuits on GitHub, which is MIT licensed.',
    'Check the licence of the outline, not only of the file. Circuit layouts are the intellectual property of the circuits themselves, which is also what the championship says in its own fan guidelines, so a project that draws a real venue should say plainly that it is unofficial and not affiliated with any series, circuit, or team.',
    'This project ships a fictional circuit only. Aster Park was drawn for the demo and resembles no real venue.',
  ],
} satisfies ComponentMeta;

export default meta;
