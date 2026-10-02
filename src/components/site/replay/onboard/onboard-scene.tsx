/**
 * The 3D part of the Onboard view: the canvas, the circuit and the cars on screen. Loaded with
 * `React.lazy` only when the viewer picks Onboard, so the Replay page's first load has no
 * three.js in it.
 *
 * It holds no race logic. Every frame it asks `onboardFrame` where the cars are at the race time
 * and maps those metres to the circuit in the world; the HUD, the notices and the camera switch
 * live in the page, outside this chunk.
 */
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, type RootState, useFrame, useThree } from '@react-three/fiber';
import {
  ACESFilmicToneMapping,
  Color,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  type PerspectiveCamera,
  Scene as ThreeScene,
  setConsoleFunction,
  SphereGeometry,
  Vector3,
} from 'three';
import { PMREMGenerator, type Renderer } from 'three/webgpu';
import type { ReplayCircuit } from '@/data/circuit-for-race';
import {
  type MarshalLight,
  type OnboardCar,
  marshalLightAt,
  onboardFrame,
} from '@/data/onboard-frame';
import { boxShare, garageShares } from '@/data/pit-garages';
import type { ReplayRace } from '@/data/replay-schema';
import { REPLAY_TICK_MS, type RaceReplay } from '@/data/use-race-replay';
import { graphicsSupport } from '../graphics-support';
import type { OnboardCamera } from '../onboard-view';
import { sidesOf } from './barriers';
import {
  type CarPlace,
  type CarRig,
  carObject,
  disposeCar,
  fadeCar,
  lightCar,
  moveCar,
} from './car-model';
import { buildMarshalPanels, setMarshalLights } from './marshal-panels';
import {
  QUALITY,
  type QualityLevel,
  type QualitySettings,
  chooseQuality,
  deviceProfile,
  frameProbe,
  stepDown,
} from './quality';
import { buildGarages, buildScenery, disposeScenery } from './scenery';
import { SKY, skyDome } from './sky';
import { WORKING_LANE_MIDDLE, boxSwing } from './surfaces';
import { MAX_ANISOTROPY } from './textures';
import { type TrackModel, angleDelta, pitchAt, pointAt, sideways, trackModel } from './track';

/** What the sky dome fades to under the horizon, and the hemisphere light's ground: the grass or the pavement. */
const GROUND_BELOW = { permanent: '#47663a', street: '#77756f' } as const;
/**
 * How much the sky's environment lights and reflects in the materials, and the sun's disc in
 * it: `radius` metres on a dome of 50, far brighter than the sky (`glow`, in linear units), so
 * the paint's clearcoat catches a sun highlight.
 */
const ENVIRONMENT = { intensity: 0.8, sun: { distance: 40, radius: 1.2, glow: 12 } } as const;

/**
 * The output's tone mapping: ACES filmic, as broadcast cameras roll off the highlights, at an
 * exposure a little over one so the paint and the asphalt do not sit in the curve's dull middle.
 */
const TONE_MAPPING = { type: ACESFilmicToneMapping, exposure: 1.1 } as const;
const UNKNOWN_TEAM_COLOUR = '#888888';

/** The sky light and the sun, and the red they lean towards under a red flag, by `amount`. */
const LIGHTS = { sky: '#dceaff', sun: '#fff4e2' } as const;
const RED_FLAG_TINT = { colour: new Color('#ff5a4a'), amount: 0.45, rate: 2 } as const;

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
 * Shadows on or off. The type is named so R3F does not fall back on PCFSoftShadowMap, which
 * WebGPURenderer has removed and warns about; PCFShadowMap works on WebGPU and on WebGL2.
 */
const SHADOWS = { enabled: true, type: PCFShadowMap } as const;
const NO_SHADOWS = { enabled: false, type: PCFShadowMap } as const;

/**
 * The sun's shadow, where the quality level casts one: a square `half` metres either side of
 * the riding car, the light `distance` metres from it along the sun's direction.
 */
const SUN_SHADOW = { half: 30, distance: 150, mapSize: 1024, bias: -0.0005 } as const;

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
    const dome = skyDome(below, ENVIRONMENT.intensity);
    dome.scale.setScalar(50);
    // The sun itself, which the dome's soft glow has no room for between its vertices.
    const sun = new Mesh(
      new SphereGeometry(ENVIRONMENT.sun.radius, 12, 8),
      new MeshBasicMaterial({ color: new Color(SKY.sun).multiplyScalar(ENVIRONMENT.sun.glow) }),
    );
    sun.position.copy(SKY.sunDirection).multiplyScalar(ENVIRONMENT.sun.distance);
    sky.add(dome, sun);
    const target = pmrem.fromScene(sky, 0.02, 0.1, 100);
    disposeMesh(dome);
    disposeMesh(sun);
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

/** What the page hears from the scene: its first frame is drawn, or it cannot draw at all. */
type SceneEvents = {
  /** `true` once the first frame is drawn; `false` again while a new renderer starts. */
  onReady: (ready: boolean) => void;
  /** Neither WebGPU nor WebGL2 could draw the scene. */
  onFailure: () => void;
};

type InnerSceneProps = SceneProps & {
  track: TrackModel;
  quality: QualitySettings;
  onFirstFrame: () => void;
  /** The frame-time probe found the frames slow, once. */
  onSlow: () => void;
};

function Scene({
  race,
  circuit,
  track,
  replay,
  followedId,
  comparedIds,
  camera: mode,
  quality,
  onFirstFrame,
  onSlow,
}: InnerSceneProps) {
  const gl = useThree((state) => state.gl);
  const { trees, standEvery, buildingEvery } = quality;
  const scenery = useMemo(
    () =>
      buildScenery(
        track,
        Math.min((gl as unknown as Renderer).getMaxAnisotropy(), MAX_ANISOTROPY),
        { trees, standEvery, buildingEvery },
      ),
    [track, gl, trees, standEvery, buildingEvery],
  );
  useEffect(() => () => disposeScenery(scenery), [scenery]);
  const below = useMemo(
    () => new Color(track.street ? GROUND_BELOW.street : GROUND_BELOW.permanent),
    [track],
  );
  const sky = useMemo(() => skyDome(below), [below]);
  useEffect(() => () => disposeMesh(sky), [sky]);
  // Inside the camera's far plane, and moved with the camera so it never comes nearer.
  const get = useThree((state) => state.get);
  useEffect(() => {
    sky.scale.setScalar(quality.far * 0.77);
    const camera = get().camera as PerspectiveCamera;
    camera.far = quality.far;
    camera.updateProjectionMatrix();
  }, [sky, get, quality.far]);
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
  // Only the ground and what stands on it take the cars' shadows; the cars cast them.
  useEffect(() => {
    for (const group of [scenery, garages]) {
      group.traverse((object) => {
        if (object instanceof Mesh) object.receiveShadow = quality.shadows;
      });
    }
  }, [scenery, garages, quality.shadows]);
  const garageSide = useMemo(() => sidesOf(track).garageSide, [track]);
  const { litePanels } = quality;
  const panels = useMemo(
    () => buildMarshalPanels(track, undefined, { lite: litePanels }),
    [track, litePanels],
  );
  useEffect(() => () => disposeScenery(panels.group), [panels]);
  // Filled in place every frame, as are the cars' places and the ghosts: nothing is made per frame.
  const lights = useRef<MarshalLight[]>([]);
  const placed = useRef(new Map<string, CarPlace>());
  const ghosts = useRef(new Set<string>());
  // Where the sun shines from, kept when the shadow's light follows the riding car.
  const sunFrom = useMemo(
    () =>
      new Vector3(
        track.centre.x + SKY.sunDirection.x * 800,
        SKY.sunDirection.y * 800,
        track.centre.z + SKY.sunDirection.z * 800,
      ),
    [track],
  );
  const sunDirection = useMemo(() => sunFrom.clone().normalize(), [sunFrom]);
  const skyLight = useRef<HemisphereLight>(null);
  const sunLight = useRef<DirectionalLight>(null);
  const tint = useRef(0);
  const lightColours = useMemo(
    () => ({ sky: new Color(LIGHTS.sky), sun: new Color(LIGHTS.sun) }),
    [],
  );

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
  const cars = useRef(new Map<string, CarRig>());
  const { carLodM, carLook } = quality;
  useEffect(() => {
    const group = carGroup.current;
    const byDriver = cars.current;
    if (!group) return;
    for (const driver of race.drivers) {
      const colour =
        race.teams.find((team) => team.id === driver.teamId)?.color ?? UNKNOWN_TEAM_COLOUR;
      const car = carObject(colour, carLook, carLodM);
      group.add(car.object);
      byDriver.set(driver.id, car);
    }
    return () => {
      for (const car of byDriver.values()) {
        group.remove(car.object);
        disposeCar(car);
      }
      byDriver.clear();
    };
  }, [race, carLodM, carLook]);
  const raceTime = useRaceTime(replay);
  const [probe] = useState(frameProbe);
  const drawn = useRef(false);
  const view = useRef<{ heading: number; ride: string; mode: OnboardCamera | undefined }>({
    heading: 0,
    ride: '',
    mode: undefined,
  });

  useFrame((state, delta) => {
    if (!drawn.current) {
      drawn.current = true;
      onFirstFrame();
    }
    if (probe(delta) === 'slow') onSlow();
    const camera = state.camera as PerspectiveCamera;
    sky.position.copy(camera.position);
    const { ms, snapped } = raceTime(delta);
    const frame = onboardFrame(race, circuit, ms, followedId, comparedIds);
    const shown = lights.current;
    shown.length = panels.shares.length;
    for (let index = 0; index < shown.length; index++) {
      shown[index] = marshalLightAt(race, panels.shares[index]!, ms);
    }
    setMarshalLights(panels, shown);
    // Under a red flag the light leans towards red, eased in and out; not a filter on the canvas.
    const red = frame.trackStatus === 'red' ? 1 : 0;
    tint.current = snapped
      ? red
      : tint.current + (red - tint.current) * (1 - Math.exp(-RED_FLAG_TINT.rate * delta));
    const lean = tint.current * RED_FLAG_TINT.amount;
    skyLight.current?.color.lerpColors(lightColours.sky, RED_FLAG_TINT.colour, lean);
    sunLight.current?.color.lerpColors(lightColours.sun, RED_FLAG_TINT.colour, lean);
    const places = placed.current;
    const ghostIds = ghosts.current;
    places.clear();
    ghostIds.clear();
    for (const car of frame.cars) {
      places.set(car.driverId, placeCar(car));
      if (car.ghost) ghostIds.add(car.driverId);
    }
    const fade = snapped ? 1 : 1 - Math.exp(-GHOST.fadeRate * delta);
    const ride = frame.riding?.driverId;
    for (const [driverId, rig] of cars.current) {
      const point = places.get(driverId);
      // Every car's materials are transparent, so a ghost needs no shader change: a solid car is
      // at opacity 1 and writes depth, a ghost does not, so it never hides the track behind it.
      fadeCar(rig, ghostIds.has(driverId) ? GHOST.opacity : 1, fade);
      lightCar(rig, frame.trackStatus);
      // In T-cam the camera is on the riding car, so its own body would fill the view.
      moveCar(rig, mode === 'tcam' && driverId === ride ? undefined : point, delta, snapped);
    }

    const car = ride === undefined ? undefined : places.get(ride);
    if (!car || ride === undefined) return;
    // The shadow's light rides along, so its small square of shadow is always round the car.
    const sun = sunLight.current;
    if (sun && quality.shadows) {
      sun.target.position.set(car.x, car.y, car.z);
      sun.target.updateMatrixWorld();
      sun.position.copy(sun.target.position).addScaledVector(sunDirection, SUN_SHADOW.distance);
    }
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
      <fog attach="fog" args={[SKY.horizon, quality.fog.near, quality.fog.far]} />
      <hemisphereLight ref={skyLight} args={[LIGHTS.sky, below, 0.7]} />
      <directionalLight
        ref={sunLight}
        position={sunFrom}
        color={LIGHTS.sun}
        intensity={2.4}
        castShadow={quality.shadows}
        shadow-mapSize={[SUN_SHADOW.mapSize, SUN_SHADOW.mapSize]}
        shadow-bias={SUN_SHADOW.bias}
        shadow-camera-left={-SUN_SHADOW.half}
        shadow-camera-right={SUN_SHADOW.half}
        shadow-camera-top={SUN_SHADOW.half}
        shadow-camera-bottom={-SUN_SHADOW.half}
        shadow-camera-near={1}
        shadow-camera-far={SUN_SHADOW.distance * 2}
      />
      <primitive object={sky} />
      <primitive object={scenery} />
      <primitive object={garages} />
      <primitive object={panels.group} />
      <group ref={carGroup} />
    </>
  );
}

type GlFactory = Extract<
  NonNullable<Parameters<typeof Canvas>[0]['gl']>,
  (...args: never[]) => unknown
>;

/** Which backend a canvas asks for: WebGPU (WebGL2 where it is missing), or WebGL2 forced. */
type Attempt = 'webgpu' | 'webgl2';

/**
 * WebGPURenderer, on WebGPU (which falls back to its own WebGL2 backend where WebGPU is missing)
 * or on WebGL2 forced. `onLost` hears of a lost device or context, which three only logs.
 */
const rendererFor =
  (attempt: Attempt, antialias: boolean, onLost: () => void): GlFactory =>
  async (defaults) => {
    const { WebGPURenderer } = await import('three/webgpu');
    const renderer = new WebGPURenderer({
      // The DOM `<Canvas>` always hands over an HTMLCanvasElement; the types allow an offscreen one.
      canvas: defaults.canvas as HTMLCanvasElement,
      antialias,
      powerPreference: 'high-performance',
      forceWebGL: attempt === 'webgl2',
    });
    renderer.onDeviceLost = (info) => {
      console.warn(`Onboard view: ${info.api} device lost: ${info.message}`);
      onLost();
    };
    await renderer.init();
    return renderer;
  };

/** Which backend the renderer ended up on, for the small label in the corner. */
function backendLabel(state: RootState): string {
  const backend = (state.gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
  return backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
}

/** Catches a renderer that fails to start, or a scene that throws, and says so once. */
class RendererBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn('Onboard view: the renderer failed', error);
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * One canvas on one backend. A new attempt is a new canvas: one that has given a WebGPU context
 * cannot give a WebGL2 one.
 */
function SceneCanvas({
  attempt,
  start,
  quality,
  level,
  onFail,
  children,
}: {
  attempt: Attempt;
  /** The level the view started at: antialiasing and the first far plane cannot change after. */
  start: QualitySettings;
  quality: QualitySettings;
  level: QualityLevel;
  onFail: (attempt: Attempt) => void;
  children: ReactNode;
}) {
  const gl = useMemo(
    () => rendererFor(attempt, start.antialias, () => onFail(attempt)),
    [attempt, start, onFail],
  );

  const camera = useMemo(
    () => ({
      fov: 75,
      near: 0.25,
      far: start.far,
      position: [0, 2, 0] as [number, number, number],
    }),
    [start],
  );
  const [backend, setBackend] = useState<string>();
  return (
    <>
      <Canvas
        aria-hidden
        dpr={[1, quality.pixelRatio]}
        camera={camera}
        gl={gl}
        shadows={quality.shadows ? SHADOWS : NO_SHADOWS}
        onCreated={(state) => {
          // After R3F's own default (ACES at exposure 1), before the first frame compiles.
          state.gl.toneMapping = TONE_MAPPING.type;
          state.gl.toneMappingExposure = TONE_MAPPING.exposure;
          setBackend(backendLabel(state));
        }}
      >
        {children}
      </Canvas>
      {backend && (
        <span className="pointer-events-none absolute right-2 bottom-11 bg-black/50 px-1 font-mono text-[10px] text-white/80">
          {backend} · {level}
        </span>
      )}
    </>
  );
}

/**
 * The canvas of the Onboard view, filling the box the page gives it. It starts on WebGPU where
 * the browser has it; if that renderer fails to start or loses its device, it starts again once
 * on WebGL2, without a page reload, and if that fails too the page is told. The quality level is
 * chosen from the device, and steps down once if the first seconds' frames are slow.
 */
export default function OnboardScene({ onReady, onFailure, ...props }: SceneProps & SceneEvents) {
  const { circuit } = props;
  const track = useMemo(() => trackModel(circuit), [circuit]);
  const [attempt, setAttempt] = useState<Attempt | 'failed'>(() =>
    graphicsSupport().webgpu ? 'webgpu' : 'webgl2',
  );
  // Only the attempt still on screen can fail: a lost device from a canvas already given up on,
  // or one lost as the view closes, changes nothing. A ref, as a lost renderer calls back late.
  const current = useRef<Attempt | 'failed' | 'closed'>(attempt);
  useEffect(() => {
    current.current = attempt;
    return () => {
      current.current = 'closed';
    };
  }, [attempt]);
  const fail = useCallback(
    (from: Attempt) => {
      if (current.current !== from) return;
      const next = from === 'webgpu' ? 'webgl2' : 'failed';
      current.current = next;
      setAttempt(next);
      if (next === 'failed') onFailure();
      else onReady(false);
    },
    [onFailure, onReady],
  );
  // One step down at most, for the whole view: a WebGL2 restart does not step down again.
  const [start] = useState(() => chooseQuality(deviceProfile()));
  const [level, setLevel] = useState(start);
  const slow = useCallback(
    () => setLevel((now) => (now === start ? (stepDown(now) ?? now) : now)),
    [start],
  );
  const ready = useCallback(() => onReady(true), [onReady]);

  if (attempt === 'failed') return null;
  return (
    <div data-slot="onboard-scene" data-quality={level} className="absolute inset-0">
      <RendererBoundary key={attempt} onError={() => fail(attempt)}>
        <SceneCanvas
          attempt={attempt}
          start={QUALITY[start]}
          quality={QUALITY[level]}
          level={level}
          onFail={fail}
        >
          <Scene
            {...props}
            track={track}
            quality={QUALITY[level]}
            onFirstFrame={ready}
            onSlow={slow}
          />
        </SceneCanvas>
      </RendererBoundary>
    </div>
  );
}
