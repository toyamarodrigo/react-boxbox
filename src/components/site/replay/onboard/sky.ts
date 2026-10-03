/**
 * The Onboard view's sky: a gradient dome from a pale horizon, the fog's colour so the far
 * ground melts into it, to a deeper blue overhead, with a soft glow round the sun. Generated, so
 * no sky image is downloaded; the same dome, small, lights the scene's reflections as its
 * environment (see `useSkyEnvironment` in `onboard-scene.tsx`).
 */
import {
  BackSide,
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

export const SKY = {
  horizon: '#c6d8e6',
  zenith: '#4d84c4',
  sun: '#fff1d6',
  /** Where the sun is, from the middle of the circuit; the directional light shines from it. */
  sunDirection: new Vector3(400, 600, 250).normalize(),
} as const;

/**
 * A dome of radius 1 seen from inside, coloured per vertex: `below` under the horizon, the
 * horizon colour at it and the zenith colour overhead, all scaled by `brightness`.
 */
export function skyDome(below: Color, brightness = 1): Mesh {
  const geometry = new SphereGeometry(1, 48, 24);
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  const horizon = new Color(SKY.horizon);
  const zenith = new Color(SKY.zenith);
  const sun = new Color(SKY.sun);
  const colour = new Color();
  const direction = new Vector3();
  for (let index = 0; index < position.count; index++) {
    direction.fromBufferAttribute(position, index).normalize();
    const up = direction.y;
    if (up < 0) colour.copy(horizon).lerp(below, Math.min(1, -up * 6));
    else colour.copy(horizon).lerp(zenith, up ** 0.55);
    const glow = Math.max(0, direction.dot(SKY.sunDirection)) ** 12;
    colour.lerp(sun, glow * 0.7);
    colour.multiplyScalar(brightness);
    colours.set([colour.r, colour.g, colour.b], index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  const dome = new Mesh(
    geometry,
    new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -20;
  dome.frustumCulled = false;
  return dome;
}
