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
    'Any outline works. Feed a GeoJSON LineString straight into pathFromPoints(coordinates) and it returns a d and a matching viewBox, with the y axis flipped so north points up. The demo outlines come from bacinger/f1-circuits on GitHub (MIT), projected and fitted by scripts/build-circuits.ts; the first point of each outline is treated as start/finish.',
    'Markers move at constant speed between position updates: set transitionMs to the interval of your data source and every update chains into the next without a stop. On a closed path (a d ending in Z) a car crosses the line without jumping back.',
    'Check the licence of the outline, not only of the file. Circuit layouts are the intellectual property of the circuits themselves, which is also what the championship says in its own fan guidelines. The layouts shown here are unofficial and this project is not affiliated with any series, circuit, or team. Aster Park is an invented circuit and safe to use anywhere.',
  ],
} satisfies ComponentMeta;

export default meta;
