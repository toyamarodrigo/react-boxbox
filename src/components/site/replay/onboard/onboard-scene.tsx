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
import { Canvas, type RootState, useFrame } from '@react-three/fiber';
import { BoxGeometry, type Mesh, type PerspectiveCamera } from 'three';
import type { ReplayCircuit } from '@/data/circuit-for-race';
import { onboardFrame } from '@/data/onboard-frame';
import type { ReplayRace } from '@/data/replay-schema';
import { REPLAY_TICK_MS, type RaceReplay } from '@/data/use-race-replay';
import type { OnboardCamera } from '../onboard-view';
import { buildScenery, disposeScenery } from './scenery';
import { type TrackModel, angleDelta, pointAt, trackModel } from './track';

const SKY = '#bcd4e6';
/** A generic formula car's footprint as a box: length, height, width, in metres. */
const CAR_GEOMETRY = new BoxGeometry(5.6, 1, 1.9);
const UNKNOWN_TEAM_COLOUR = '#888888';

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
  const scenery = useMemo(() => buildScenery(track), [track]);
  useEffect(() => () => disposeScenery(scenery), [scenery]);

  const colours = useMemo(
    () =>
      new Map(
        race.drivers.map((driver) => [
          driver.id,
          race.teams.find((team) => team.id === driver.teamId)?.color ?? UNKNOWN_TEAM_COLOUR,
        ]),
      ),
    [race],
  );
  const cars = useRef(new Map<string, Mesh>());
  const raceTime = useRaceTime(replay);
  const view = useRef<{ heading: number; ride: string; mode: OnboardCamera | undefined }>({
    heading: 0,
    ride: '',
    mode: undefined,
  });

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    const { ms, snapped } = raceTime(delta);
    const frame = onboardFrame(race, circuit, ms, followedId, comparedIds);
    const placed = new Map(
      frame.cars.map((car) => [
        car.driverId,
        pointAt(car.inPit ? track.pit : track.lap, car.metres),
      ]),
    );
    for (const [driverId, mesh] of cars.current) {
      const point = placed.get(driverId);
      mesh.visible = point !== undefined;
      if (!point) continue;
      mesh.position.set(point.x, 0.5, point.z);
      mesh.rotation.y = -point.heading;
    }

    const ride = frame.riding?.driverId;
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
    if (mode === 'tcam') {
      // Just above and behind the airbox, rigid on the car, looking along the track.
      const back = 0.6;
      camera.position.set(
        car.x - Math.cos(car.heading) * back,
        1.3,
        car.z - Math.sin(car.heading) * back,
      );
      camera.lookAt(camera.position.x + dx * 50, 0.9, camera.position.z + dz * 50);
    } else {
      camera.position.set(car.x - dx * 9.5, 3.2, car.z - dz * 9.5);
      camera.lookAt(car.x + dx * 12, 1, car.z + dz * 12);
    }
  });

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 250, 1800]} />
      <hemisphereLight args={['#dceaff', '#3d5c2e', 1.6]} />
      <directionalLight
        position={[track.centre.x + 400, 600, track.centre.z + 250]}
        intensity={2}
      />
      <primitive object={scenery} />
      {race.drivers.map((driver) => (
        <mesh
          key={driver.id}
          geometry={CAR_GEOMETRY}
          visible={false}
          ref={(mesh) => {
            if (!mesh) return;
            cars.current.set(driver.id, mesh);
            return () => {
              cars.current.delete(driver.id);
            };
          }}
        >
          <meshStandardMaterial color={colours.get(driver.id)} roughness={0.45} metalness={0.1} />
        </mesh>
      ))}
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
