/**
 * The shapes the Onboard view's car is sculpted from: smooth lofts over rings of points, wing
 * sections, plates with rounded corners and rods. Geometry only, no materials.
 *
 * Car axes: `x` along the car, nose at +x; `y` up; `z` across, +z to the right of travel.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  Vector2,
  Vector3,
} from 'three';

/**
 * A cross-section of a loft: at `x` along the car, centred `z` across it, `y` from `bottom` to
 * `top`. `bend` is the roundness of its corners: 0 is a box, 1 an ellipse; between, a
 * superellipse.
 */
export type LoftStation = {
  x: number;
  z?: number;
  halfWidth: number;
  bottom: number;
  top: number;
  bend?: number;
};

/** A ring of `sides` points round a station, in its plane; a box ring with four. */
export function ring(
  { x, z = 0, halfWidth, bottom, top, bend = 2 / 3 }: LoftStation,
  sides: number,
): Vector3[] {
  const middle = (top + bottom) / 2;
  const halfHeight = (top - bottom) / 2;
  const box = sides === 4;
  const points: Vector3[] = [];
  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2 + (box ? Math.PI / 4 : 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const exponent = box ? 0 : bend;
    points.push(
      new Vector3(
        x,
        middle + Math.sign(sin) * Math.abs(sin) ** exponent * halfHeight,
        z + Math.sign(cos) * Math.abs(cos) ** exponent * halfWidth,
      ),
    );
  }
  return points;
}

/**
 * A smooth skin over `rings` of equal size, in order, with smooth normals: the rings' winding
 * decides which way its faces look. Open at both ends.
 */
export function skin(rings: readonly (readonly Vector3[])[]): BufferGeometry {
  const sides = rings[0]!.length;
  const positions = rings.flatMap((points) => points.flatMap((point) => point.toArray()));
  const indices: number[] = [];
  for (let station = 0; station + 1 < rings.length; station++) {
    for (let side = 0; side < sides; side++) {
      const a = station * sides + side;
      const b = station * sides + ((side + 1) % sides);
      const c = b + sides;
      const d = a + sides;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A flat fan closing `points`, facing `outward` whichever way the ring winds. */
export function cap(points: readonly Vector3[], outward: Vector3): BufferGeometry {
  const centre = points
    .reduce((sum, point) => sum.add(point), new Vector3())
    .divideScalar(points.length);
  const edgeA = new Vector3().subVectors(points[0]!, centre);
  const edgeB = new Vector3().subVectors(points[1]!, centre);
  const flip = edgeA.cross(edgeB).dot(outward) < 0;
  const positions: number[] = [];
  for (const [index, point] of points.entries()) {
    const next = points[(index + 1) % points.length]!;
    const [b, c] = flip ? [next, point] : [point, next];
    positions.push(...centre.toArray(), ...b.toArray(), ...c.toArray());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

const FORWARD = new Vector3(1, 0, 0);
const BACKWARD = new Vector3(-1, 0, 0);

/**
 * A smooth tube through `stations`, front (greatest `x`) to back, with its front and back caps
 * apart so they can take another material.
 */
export function loft(
  stations: readonly LoftStation[],
  sides: number,
): { tube: BufferGeometry; front: BufferGeometry; back: BufferGeometry } {
  const rings = stations.map((station) => ring(station, sides));
  return {
    tube: skin(rings),
    front: cap(rings[0]!, FORWARD),
    back: cap(rings.at(-1)!, BACKWARD),
  };
}

/**
 * The outline of a wing section, as (x, y) from the leading edge at the origin back along -x:
 * `chord` long, `thickness` and `camber` as shares of the chord (a negative camber bows the
 * section down, as a wing that presses the car down), `points` along each surface. Round the
 * upper surface to the trailing edge and back under.
 */
export function airfoil(chord: number, thickness: number, camber: number, points = 7): Vector2[] {
  const upper: Vector2[] = [];
  const lower: Vector2[] = [];
  for (let index = 0; index <= points; index++) {
    const t = index / points;
    const half =
      5 *
      thickness *
      (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t ** 2 + 0.2843 * t ** 3 - 0.1036 * t ** 4);
    const mean = camber * 4 * t * (1 - t);
    upper.push(new Vector2(-t * chord, (mean + half) * chord));
    lower.push(new Vector2(-t * chord, (mean - half) * chord));
  }
  return [...upper, ...lower.reverse().slice(1, -1)];
}

/** A wing section's place across the car: its leading edge at `x`, `y` and `z`, pitched `angle` radians (positive puts the trailing edge down). */
export type WingStation = { z: number; x: number; y: number; chord: number; angle: number };

/** The thickness, camber and points of a wing's sections. */
export type WingSection = { thickness: number; camber: number; points?: number };

/**
 * A wing element skinned over `stations` across the car, each a section pitched in place, its
 * ends closed. The stations run from -z to +z so the skin faces out.
 */
export function wing(stations: readonly WingStation[], section: WingSection): BufferGeometry[] {
  const rings = stations.map(({ z, x, y, chord, angle }) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return airfoil(chord, section.thickness, section.camber, section.points).map(
      (point) =>
        new Vector3(x + point.x * cos - point.y * sin, y + point.x * sin + point.y * cos, z),
    );
  });
  return [
    skin(rings),
    cap(rings[0]!, new Vector3(0, 0, -1)),
    cap(rings.at(-1)!, new Vector3(0, 0, 1)),
  ];
}

/** `stations` given from the middle outwards, mirrored into a run from -z to +z. */
export function mirrored(stations: readonly WingStation[]): WingStation[] {
  const right = stations.filter((station) => station.z > 0);
  return [
    ...right.map((station) => ({ ...station, z: -station.z })).reverse(),
    ...stations.filter((station) => station.z === 0),
    ...right,
  ];
}

/**
 * A flat plate on the car's `z`, `thickness` thick, with the outline's corners rounded to
 * `radius` and its edges bevelled a little: an endplate, a fin, a pylon.
 */
export function plate(
  outline: readonly [number, number][],
  radius: number,
  z: number,
  thickness: number,
): BufferGeometry {
  const shape = new Shape();
  const n = outline.length;
  const at = (index: number) => new Vector2(...outline[(index + n) % n]!);
  const towards = (from: Vector2, to: Vector2) => {
    const direction = to.clone().sub(from);
    const length = direction.length();
    return from.clone().addScaledVector(direction, Math.min(radius, length / 2) / length);
  };
  for (let index = 0; index < n; index++) {
    const corner = at(index);
    const start = towards(corner, at(index - 1));
    const end = towards(corner, at(index + 1));
    if (index === 0) shape.moveTo(start.x, start.y);
    else shape.lineTo(start.x, start.y);
    shape.quadraticCurveTo(corner.x, corner.y, end.x, end.y);
  }
  shape.closePath();
  const bevel = Math.min(0.003, thickness / 4);
  return new ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  }).translate(0, 0, z - thickness / 2 + bevel);
}

/** A round rod of `radius` from `from` to `to`, `sides` round. */
export function rod(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  radius: number,
  sides = 6,
): BufferGeometry {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const direction = b.clone().sub(a);
  const length = direction.length();
  // The cylinder is along its y; turned onto z, which `lookAt` then points along `direction`.
  const geometry = new CylinderGeometry(radius, radius, length, sides, 1, true).rotateX(
    Math.PI / 2,
  );
  geometry.lookAt(direction.normalize());
  const middle = a.clone().add(b).multiplyScalar(0.5);
  return geometry.translate(middle.x, middle.y, middle.z);
}
