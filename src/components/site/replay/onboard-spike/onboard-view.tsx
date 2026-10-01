/**
 * SPIKE (issue #9), throwaway. The Onboard view at Monza, behind `?onboard=spike` on the Replay
 * page. It rides with the followed driver, or the leader without one, at race time, and answers
 * two questions before the full build (#8): does an onboard view on interpolated lap data feel
 * right, and which renderer should it use?
 *
 * Loaded with a dynamic import only when the param is on, so the Replay page's initial chunk has
 * no three.js in it; `three/webgpu` is a further import, only when the WebGPURenderer is asked for.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type RootState, useFrame } from '@react-three/fiber';
import { BoxGeometry, type Mesh, type PerspectiveCamera } from 'three';
import { CIRCUITS } from '../../../../data/circuits';
import type { ReplayRace } from '../../../../data/replay-schema';
import { carLapsAt } from '../../../../data/replay-timing';
import { REPLAY_TICK_MS, type RaceReplay } from '../../../../data/use-race-replay';
import { Button } from '../../../ui/button';
import { placeCars, ridingWith } from './placement';
import { buildScenery, disposeScenery } from './scenery';
import { type SpeedProfile, speedProfile } from './speed-profile';
import { type TrackModel, angleDelta, trackModel } from './track';

export type OnboardRenderer = 'webgpu' | 'webgl';
type CameraMode = 'tcam' | 'chase';

const MONZA_ID = 'it-1922';
const SKY = '#bcd4e6';

/**
 * The Replay clock ticks ten times a second; the scene draws at the display's rate. Between ticks
 * the race time runs on at the replay speed and is pulled gently back onto the clock, so a late
 * tick never makes the cars stutter. A seek, a pause or a big gap snaps it instead.
 */
type ClockSample = {
  base: number;
  at: number;
  playing: boolean;
  speed: number;
  endMs: number;
  snap: boolean;
};

/** The Replay clock, smoothed into a race time to read once per frame. */
function useRaceTime({ elapsedMs, isPlaying, speed, endMs, jumped }: RaceReplay) {
  const sample = useRef<ClockSample>({
    base: elapsedMs,
    at: 0,
    playing: false,
    speed,
    endMs,
    snap: true,
  });
  const shown = useRef(0);
  useEffect(() => {
    sample.current = {
      base: elapsedMs,
      at: performance.now(),
      playing: isPlaying,
      speed,
      endMs,
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

const CAR_GEOMETRY = new BoxGeometry(5.6, 1, 1.9);

function Scene({
  race,
  track,
  profile,
  pit,
  followedId,
  replay,
  mode,
}: {
  race: ReplayRace;
  track: TrackModel;
  profile: SpeedProfile;
  pit: { entry: number; exit: number };
  followedId: string | undefined;
  replay: RaceReplay;
  mode: CameraMode;
}) {
  const scenery = useMemo(() => buildScenery(track), [track]);
  useEffect(() => () => disposeScenery(scenery), [scenery]);

  const colours = useMemo(
    () =>
      new Map(
        race.drivers.map((driver) => [
          driver.id,
          race.teams.find((team) => team.id === driver.teamId)?.color ?? '#888888',
        ]),
      ),
    [race],
  );
  const cars = useRef(new Map<string, Mesh>());
  const raceTime = useRaceTime(replay);
  const view = useRef<{ heading: number; ride: string; mode: CameraMode | undefined }>({
    heading: 0,
    ride: '',
    mode: undefined,
  });

  useFrame((frame, delta) => {
    const camera = frame.camera as PerspectiveCamera;
    const { ms, snapped } = raceTime(delta);
    const placed = placeCars(race, ms, track, profile, pit);
    for (const [driverId, mesh] of cars.current) {
      const car = placed.get(driverId);
      mesh.visible = car !== undefined;
      if (!car) continue;
      mesh.position.set(car.x, 0.5, car.z);
      mesh.rotation.y = -car.heading;
    }

    const ride = ridingWith(placed, followedId);
    const car = ride === undefined ? undefined : placed.get(ride);
    if (!car || ride === undefined) return;
    const state = view.current;
    if (snapped || state.mode !== mode || state.ride !== ride) {
      if (state.mode !== mode) {
        camera.fov = mode === 'tcam' ? 75 : 62;
        camera.updateProjectionMatrix();
      }
      state.heading = car.heading;
      state.ride = ride;
      state.mode = mode;
    } else {
      // Smoothed so the view does not twitch where the heading changes between samples.
      const rate = mode === 'tcam' ? 10 : 4;
      state.heading += angleDelta(state.heading, car.heading) * (1 - Math.exp(-rate * delta));
    }
    const dx = Math.cos(state.heading);
    const dz = Math.sin(state.heading);
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

/** A plain frame counter, written straight into the overlay so React does not re-render. */
function FpsMeter({ onSample }: { onSample: (fps: number) => void }) {
  const counter = useRef({ frames: 0, since: 0 });
  useFrame(() => {
    const sampled = counter.current;
    sampled.frames++;
    const now = performance.now();
    if (sampled.since === 0) sampled.since = now;
    if (now - sampled.since >= 500) {
      const fps = (sampled.frames * 1000) / (now - sampled.since);
      onSample(fps);
      sampled.frames = 0;
      sampled.since = now;
    }
  });
  return null;
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

function backendLabel(state: RootState, renderer: OnboardRenderer): string {
  if (renderer === 'webgl') return 'WebGL2 · WebGLRenderer';
  const backend = (state.gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
  return backend?.isWebGPUBackend ? 'WebGPU · WebGPURenderer' : 'WebGL2 fallback · WebGPURenderer';
}

export default function OnboardView({
  race,
  replay,
  followedId,
  renderer,
}: {
  race: ReplayRace;
  replay: RaceReplay;
  followedId: string | undefined;
  renderer: OnboardRenderer;
}) {
  const circuit = CIRCUITS.find((item) => item.id === MONZA_ID);
  const track = useMemo(() => (circuit ? trackModel(circuit) : undefined), [circuit]);
  const profile = useMemo(() => (track ? speedProfile(track.lap) : undefined), [track]);
  const [mode, setMode] = useState<CameraMode>('tcam');
  const [backend, setBackend] = useState('starting…');
  const fps = useRef<HTMLSpanElement>(null);

  // The label reads the Replay clock's ticks; the scene reads its own smoothed time.
  const pit = circuit?.pit;
  const rideId = useMemo(
    () => (pit ? ridingWith(carLapsAt(race, replay.elapsedMs, pit), followedId) : undefined),
    [race, replay.elapsedMs, pit, followedId],
  );
  const rideCode = race.drivers.find((driver) => driver.id === rideId)?.code;
  const riding =
    rideCode === undefined
      ? 'No car running'
      : rideId === followedId
        ? `Riding with ${rideCode}`
        : `Following leader ${rideCode} · pick a driver`;

  if (!circuit || !track || !profile || !pit) return null;

  return (
    <div
      data-slot="onboard-view"
      className="relative h-[min(70vh,34rem)] w-full overflow-hidden bg-[#bcd4e6]"
    >
      <p className="sr-only">{`Onboard view (spike). ${riding}.`}</p>
      <Canvas
        key={renderer}
        aria-hidden
        dpr={[1, 2]}
        camera={{ fov: 75, near: 0.25, far: 2600, position: [0, 2, 0] }}
        gl={
          renderer === 'webgpu'
            ? webgpuRenderer
            : { antialias: true, powerPreference: 'high-performance' }
        }
        onCreated={(state) => setBackend(backendLabel(state, renderer))}
      >
        <Scene
          race={race}
          track={track}
          profile={profile}
          pit={pit}
          followedId={followedId}
          replay={replay}
          mode={mode}
        />
        <FpsMeter
          onSample={(value) => {
            if (fps.current) fps.current.textContent = `${value.toFixed(0)} fps`;
          }}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between gap-2 p-2 font-mono text-[11px] text-white">
        <span className="bg-black/60 px-1.5 py-0.5">{riding}</span>
        <span className="bg-black/60 px-1.5 py-0.5 text-right">
          {backend} · <span ref={fps}>– fps</span>
        </span>
      </div>
      <div className="absolute bottom-2 right-2">
        <Button
          size="xs"
          variant="secondary"
          onClick={() => setMode((current) => (current === 'tcam' ? 'chase' : 'tcam'))}
        >
          {mode === 'tcam' ? 'T-cam · switch to chase' : 'Chase · switch to T-cam'}
        </Button>
      </div>
    </div>
  );
}
