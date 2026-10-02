/**
 * The 3D part of the Onboard view: the canvas, the circuit and the cars on screen. Loaded with
 * `React.lazy` only when the viewer picks Onboard, so the Replay page's first load has no
 * three.js in it.
 *
 * It holds no race logic. Every frame it asks `onboardFrame` where the cars are at the race time
 * and maps those metres to the circuit in the world; the HUD, the notices and the camera switch
 * live in the page, outside this chunk.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type RootState, useFrame, useThree } from '@react-three/fiber';
import {
  Color,
  type Group,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  type PerspectiveCamera,
  Scene as ThreeScene,
  setConsoleFunction,
} from 'three';
import { PMREMGenerator, type Renderer } from 'three/webgpu';
import type { ReplayCircuit } from '@/data/circuit-for-race';
import { type OnboardCar, onboardFrame } from '@/data/onboard-frame';
import { boxShare, garageShares } from '@/data/pit-garages';
import type { ReplayRace } from '@/data/replay-schema';
import { REPLAY_TICK_MS, type RaceReplay } from '@/data/use-race-replay';
import type { OnboardCamera } from '../onboard-view';
import { sidesOf } from './barriers';
import { carObject } from './car-model';
import { buildGarages, buildScenery, disposeScenery } from './scenery';
import { SKY, skyDome } from './sky';
import { WORKING_LANE_MIDDLE, boxSwing } from './surfaces';
import { MAX_ANISOTROPY } from './textures';
import {
  type TrackModel,
  type TrackPoint,
  angleDelta,
  pitchAt,
  pointAt,
  sideways,
  trackModel,
} from './track';

/** What the sky dome fades to under the horizon, and the hemisphere light's ground: the grass or the pavement. */
const GROUND_BELOW = { permanent: '#47663a', street: '#77756f' } as const;
/** How much the sky's environment lights and reflects in the materials. */
const ENVIRONMENT_INTENSITY = 0.8;
const UNKNOWN_TEAM_COLOUR = '#888888';

/**
 * A ghost car's opacity, and how fast a car fades to it and back, per second. The fade keeps a
 * car that sits at the overlap distance from flickering between solid and ghost.
 */
const GHOST = { opacity: 0.35, fadeRate: 12 } as const;

/**
 * Where a T-cam sits on the car it rides with, in metres from the car's centre: up off the
 * track, ahead of the centre (just behind the front axle, which is about 1.8 m ahead), and the
 * small downward pitch it looks ahead along the track with, in radians.
 */
const TCAM = { height: 1.1, ahead: 1.4, pitch: 0.03 } as const;

/**
 * No shadows. Named so R3F does not fall back on PCFSoftShadowMap, which WebGPURenderer has
 * removed and warns about; PCFShadowMap works on WebGPU and on its WebGL2 backend.
 */
const NO_SHADOWS = { enabled: false, type: PCFShadowMap } as const;

/**
 * R3F 9 makes a `THREE.Clock` for every canvas, which three r183+ warns is deprecated. The
 * scene times nothing with it (it reads R3F's frame delta), so only that one warning is dropped
 * and every other message goes to the console as three sends it. Remove with R3F 10, which uses
 * `THREE.Timer` (pmndrs/react-three-fiber#3741).
 */
setConsoleFunction((type, message, ...params) => {
  if (type === 'warn' && String(message).includes('Clock: This module has been deprecated')) {
    return;
  }
  const log = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log;
  // As three's own default: a TSL stack trace is shown as an error with the message.
  const [first] = params;
  const trace = first as { isStackTrace?: boolean; getError?: (message: string) => Error };
  if (trace?.isStackTrace && trace.getError) log(trace.getError(message));
  else log(message, ...params);
});

/** What the scene reads of the Replay clock. */
type ReplayClock = Pick<RaceReplay, 'elapsedMs' | 'isPlaying' | 'speed' | 'endMs' | 'jumped'>;

/**
 * The clock as the scene last saw it. Between the Replay's 100 ms ticks the race time runs on
 * at the replay speed and is pulled gently back onto the clock, so a late tick never makes the
 * cars stutter. A seek, a pause or a big gap snaps it instead.
 */
type ClockSample = {
  base: number;
  at: number;
  playing: boolean;
  speed: number;
  endMs: number;
  snap: boolean;
};

/** The Replay clock, smoothed into a race time the scene reads once per drawn frame. */
function useRaceTime({ elapsedMs, isPlaying, speed, endMs, jumped }: ReplayClock) {
  const sample = useRef<ClockSample>({
    base: elapsedMs,
    at: 0,
    playing: false,
    speed,
    endMs,
    snap: true,
  });
  const shown = useRef(elapsedMs);
  useEffect(() => {
    sample.current = {
      base: elapsedMs,
      at: performance.now(),
      playing: isPlaying,
      speed,
      endMs,
      // A seek snaps the cars to their new place: sliding there would cross the circuit.
      snap: sample.current.snap || jumped || !isPlaying,
    };
  }, [elapsedMs, isPlaying, speed, endMs, jumped]);

  return (delta: number): { ms: number; snapped: boolean } => {
    const clock = sample.current;
    const ahead = clock.playing
      ? Math.min((performance.now() - clock.at) * clock.speed, REPLAY_TICK_MS * clock.speed * 2)
      : 0;
    const target = Math.min(clock.base + ahead, clock.endMs);
    const snapped = clock.snap || Math.abs(target - shown.current) > 2000 * clock.speed;
    if (snapped || !clock.playing) {
      shown.current = target;
      sample.current = { ...clock, snap: false };
    } else {
      const advanced = shown.current + delta * 1000 * clock.speed;
      shown.current = Math.min(
        advanced + (target - advanced) * Math.min(1, delta * 4),
        clock.endMs,
      );
    }
    return { ms: shown.current, snapped };
  };
}

/** Moves a car material's opacity `fade` of the way to `target`; only an opaque one writes depth. */
function fadeTo(material: MeshStandardMaterial, target: number, fade: number) {
  material.opacity += (target - material.opacity) * fade;
  if (Math.abs(target - material.opacity) < 0.005) material.opacity = target;
  material.depthWrite = material.opacity === 1;
}

/** Where a car stands: on the ground at a track point, pitched nose up by `pitch` radians uphill. */
type CarPlace = TrackPoint & { pitch: number };

/** Stands a car on the ground at `place`, turned along it and pitched with the slope, or hides it. */
function standCar(car: Object3D, place: CarPlace | undefined) {
  car.visible = place !== undefined;
  if (!place) return;
  car.position.set(place.x, place.y, place.z);
  // Turned first, then pitched about its own width: the car's length is along its local `x`.
  car.rotation.set(0, -place.heading, place.pitch, 'YXZ');
}

/** Frees a mesh's geometry and material. */
function disposeMesh(mesh: Mesh) {
  mesh.geometry.dispose();
  (mesh.material as Material).dispose();
}

/**
 * The scene's environment, for its reflections and soft fill light: the sky dome, dimmed to
 * `ENVIRONMENT_INTENSITY`, rendered once into a small prefiltered cube map. Works on WebGPU and
 * on its WebGL2 backend alike. Made and freed in one effect, so a remount makes it again.
 */
function useSkyEnvironment(below: Color) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const { gl, scene } = get();
    const pmrem = new PMREMGenerator(gl as unknown as Renderer);
    const sky = new ThreeScene();
    const dome = skyDome(below, ENVIRONMENT_INTENSITY);
    dome.scale.setScalar(50);
    sky.add(dome);
    const target = pmrem.fromScene(sky, 0.02, 0.1, 100);
    disposeMesh(dome);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [get, below]);
}

type SceneProps = {
  race: ReplayRace;
  circuit: ReplayCircuit;
  replay: ReplayClock;
  followedId: string | undefined;
  comparedIds: readonly string[];
  camera: OnboardCamera;
};

function Scene({
  race,
  circuit,
  track,
  replay,
  followedId,
  comparedIds,
  camera: mode,
}: SceneProps & { track: TrackModel }) {
  const gl = useThree((state) => state.gl);
  const scenery = useMemo(
    () =>
      buildScenery(track, Math.min((gl as unknown as Renderer).getMaxAnisotropy(), MAX_ANISOTROPY)),
    [track, gl],
  );
  useEffect(() => () => disposeScenery(scenery), [scenery]);
  const below = useMemo(
    () => new Color(track.street ? GROUND_BELOW.street : GROUND_BELOW.permanent),
    [track],
  );
  const sky = useMemo(() => {
    const dome = skyDome(below);
    // Inside the camera's far plane, and moved with the camera so it never comes nearer.
    dome.scale.setScalar(2000);
    return dome;
  }, [below]);
  useEffect(() => () => disposeMesh(sky), [sky]);
  useSkyEnvironment(below);
  // Each team's garage at its box, where `carLapsAt` stops its cars.
  const garages = useMemo(
    () =>
      buildGarages(
        track,
        [...garageShares(race)].map(([teamId, share]) => ({
          share,
          colour: race.teams.find((team) => team.id === teamId)?.color ?? UNKNOWN_TEAM_COLOUR,
        })),
      ),
    [track, race],
  );
  useEffect(() => () => disposeScenery(garages), [garages]);
  const garageSide = useMemo(() => sidesOf(track).garageSide, [track]);

  /**
   * Where a car stands in the world: on the racing line, or on the pit lane's line, which runs
   * in the fast lane. On a stop with a stationary time it moves across into the working lane in
   * front of its garage and back (`boxSwing`), turned along the way it moves. It pitches with
   * the slope of the line it is on.
   */
  const placeCar = (car: OnboardCar): CarPlace => {
    const line = car.inPit ? track.pitLine : track.line;
    const pitch = pitchAt(line, car.metres);
    if (!car.boxStop || !car.inPit) return { ...pointAt(line, car.metres), pitch };
    const box = boxShare(race, car.driverId) * circuit.pitLengthM;
    const at = (metres: number) => {
      const point = pointAt(track.pitLine, metres);
      const across = garageSide * WORKING_LANE_MIDDLE * boxSwing(metres, box);
      const [x, z] = sideways(point.x, point.z, point.heading, across);
      return { x, z, y: point.y };
    };
    const here = at(car.metres);
    const behind = at(car.metres - 0.5);
    const ahead = at(car.metres + 0.5);
    return { ...here, heading: Math.atan2(ahead.z - behind.z, ahead.x - behind.x), pitch };
  };

  // Every driver's car in the team colour, hidden until it is on screen. The geometries are
  // shared by every car and kept; only the materials are each car's own.
  const carGroup = useRef<Group>(null);
  const cars = useRef(new Map<string, ReturnType<typeof carObject>>());
  useEffect(() => {
    const group = carGroup.current;
    const byDriver = cars.current;
    if (!group) return;
    for (const driver of race.drivers) {
      const colour =
        race.teams.find((team) => team.id === driver.teamId)?.color ?? UNKNOWN_TEAM_COLOUR;
      const car = carObject(colour);
      car.object.visible = false;
      group.add(car.object);
      byDriver.set(driver.id, car);
    }
    return () => {
      for (const car of byDriver.values()) {
        group.remove(car.object);
        for (const material of car.materials) material.dispose();
      }
      byDriver.clear();
    };
  }, [race]);
  const raceTime = useRaceTime(replay);
  const view = useRef<{ heading: number; ride: string; mode: OnboardCamera | undefined }>({
    heading: 0,
    ride: '',
    mode: undefined,
  });

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    sky.position.copy(camera.position);
    const { ms, snapped } = raceTime(delta);
    const frame = onboardFrame(race, circuit, ms, followedId, comparedIds);
    const placed = new Map(frame.cars.map((car) => [car.driverId, placeCar(car)]));
    const ghosts = new Set(frame.cars.filter((car) => car.ghost).map((car) => car.driverId));
    const fade = snapped ? 1 : 1 - Math.exp(-GHOST.fadeRate * delta);
    const ride = frame.riding?.driverId;
    for (const [driverId, { object, materials }] of cars.current) {
      const point = placed.get(driverId);
      // Every car's materials are transparent, so a ghost needs no shader change: a solid car is
      // at opacity 1 and writes depth, a ghost does not, so it never hides the track behind it.
      const target = ghosts.has(driverId) ? GHOST.opacity : 1;
      for (const material of materials) fadeTo(material, target, fade);
      // In T-cam the camera is on the riding car, so its own body would fill the view.
      standCar(object, mode === 'tcam' && driverId === ride ? undefined : point);
    }

    const car = ride === undefined ? undefined : placed.get(ride);
    if (!car || ride === undefined) return;
    const last = view.current;
    if (snapped || last.mode !== mode || last.ride !== ride) {
      if (last.mode !== mode) {
        camera.fov = mode === 'tcam' ? 75 : 62;
        camera.updateProjectionMatrix();
      }
      last.heading = car.heading;
      last.ride = ride;
      last.mode = mode;
    } else {
      // Smoothed so the view does not twitch where the heading changes between samples.
      const rate = mode === 'tcam' ? 10 : 4;
      last.heading += angleDelta(last.heading, car.heading) * (1 - Math.exp(-rate * delta));
    }
    const dx = Math.cos(last.heading);
    const dz = Math.sin(last.heading);
    // The slope the car is on, so the camera climbs and dips along with it.
    const slope = Math.tan(car.pitch);
    if (mode === 'tcam') {
      // Rigid on the car just behind its front axle, looking ahead along the track.
      camera.position.set(
        car.x + Math.cos(car.heading) * TCAM.ahead,
        car.y + TCAM.height + slope * TCAM.ahead,
        car.z + Math.sin(car.heading) * TCAM.ahead,
      );
      const ahead = 50;
      camera.lookAt(
        camera.position.x + dx * ahead,
        camera.position.y + Math.tan(car.pitch - TCAM.pitch) * ahead,
        camera.position.z + dz * ahead,
      );
    } else {
      camera.position.set(car.x - dx * 9.5, car.y + 3.2 - slope * 9.5, car.z - dz * 9.5);
      camera.lookAt(car.x + dx * 12, car.y + 1 + slope * 12, car.z + dz * 12);
    }
  });

  return (
    <>
      <color attach="background" args={[SKY.horizon]} />
      <fog attach="fog" args={[SKY.horizon, 250, 1800]} />
      <hemisphereLight args={['#dceaff', below, 0.7]} />
      <directionalLight
        position={[
          track.centre.x + SKY.sunDirection.x * 800,
          SKY.sunDirection.y * 800,
          track.centre.z + SKY.sunDirection.z * 800,
        ]}
        color="#fff4e2"
        intensity={2.4}
      />
      <primitive object={sky} />
      <primitive object={scenery} />
      <primitive object={garages} />
      <group ref={carGroup} />
    </>
  );
}

type GlFactory = Extract<
  NonNullable<Parameters<typeof Canvas>[0]['gl']>,
  (...args: never[]) => unknown
>;

/** WebGPURenderer, which falls back to its own WebGL2 backend where WebGPU is missing. */
const webgpuRenderer: GlFactory = async (defaults) => {
  const { WebGPURenderer } = await import('three/webgpu');
  const renderer = new WebGPURenderer({
    // The DOM `<Canvas>` always hands over an HTMLCanvasElement; the types allow an offscreen one.
    canvas: defaults.canvas as HTMLCanvasElement,
    antialias: true,
    powerPreference: 'high-performance',
  });
  await renderer.init();
  return renderer;
};

/** Which backend the renderer ended up on, for the small label in the corner. */
function backendLabel(state: RootState): string {
  const backend = (state.gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
  return backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
}

/** The canvas of the Onboard view, filling the box the page gives it. */
export default function OnboardScene(props: SceneProps) {
  const { circuit } = props;
  const track = useMemo(() => trackModel(circuit), [circuit]);
  const [backend, setBackend] = useState<string>();

  return (
    <div data-slot="onboard-scene" className="absolute inset-0">
      <Canvas
        aria-hidden
        dpr={[1, 2]}
        camera={{ fov: 75, near: 0.25, far: 2600, position: [0, 2, 0] }}
        gl={webgpuRenderer}
        shadows={NO_SHADOWS}
        onCreated={(state) => setBackend(backendLabel(state))}
      >
        <Scene {...props} track={track} />
      </Canvas>
      {backend && (
        <span className="pointer-events-none absolute right-2 bottom-11 bg-black/50 px-1 font-mono text-[10px] text-white/80">
          {backend}
        </span>
      )}
    </div>
  );
}
