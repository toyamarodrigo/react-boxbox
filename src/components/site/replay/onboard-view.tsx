import { lazy, Suspense, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ReplayCircuit } from '@/data/circuit-for-race';
import { onboardFrame } from '@/data/onboard-frame';
import type { ReplayRace } from '@/data/replay-schema';
import type { RaceReplay } from '@/data/use-race-replay';

/** The two cameras of the Onboard view: above the airbox, or behind the car. */
export type OnboardCamera = 'tcam' | 'chase';

const CAMERAS: readonly { value: OnboardCamera; label: string }[] = [
  { value: 'tcam', label: 'T-cam' },
  { value: 'chase', label: 'Chase' },
];

// Its own chunk, fetched the first time the viewer picks Onboard: three.js stays out of the
// Replay page's first load.
const OnboardScene = lazy(() => import('./onboard/onboard-scene'));

/** A line of text on the scene, dark behind it so it reads over sky and asphalt alike. */
const LABEL = 'bg-black/60 px-1.5 py-0.5 text-white';

/**
 * The Onboard view in the Track Map panel: the 3D scene, and over it the HUD, the notices, the
 * camera switch and the Track Map as a minimap with every car. The HUD reads the onboard frame
 * at the clock's ticks; the scene reads it again every drawn frame, so the two never disagree on
 * whom the camera rides with for longer than a tick.
 */
export function OnboardView({
  race,
  replay,
  circuit,
  followedId,
  comparedIds,
  minimap,
}: {
  race: ReplayRace;
  replay: RaceReplay;
  circuit: ReplayCircuit;
  followedId: string | undefined;
  comparedIds: readonly string[];
  minimap: React.ReactNode;
}) {
  const [camera, setCamera] = useState<OnboardCamera>('tcam');
  const frame = useMemo(
    () => onboardFrame(race, circuit, replay.elapsedMs, followedId, comparedIds),
    [race, circuit, replay.elapsedMs, followedId, comparedIds],
  );
  const codeOf = (driverId: string | undefined) =>
    race.drivers.find((driver) => driver.id === driverId)?.code;

  const riding = frame.riding;
  const ridingCode = codeOf(riding?.driverId);
  const versus = codeOf(frame.cars[1]?.driverId);
  const firstCompared = codeOf(comparedIds[0]);
  const notice = (() => {
    if (riding === null) return 'No car on track';
    if (frame.ridingLeader) {
      return followedId === undefined
        ? 'Following leader · pick a driver'
        : `Following leader · ${codeOf(followedId) ?? 'your driver'} is not on track`;
    }
    if (versus !== undefined) return undefined;
    return firstCompared === undefined
      ? 'Add a compared driver to see them on track'
      : `${firstCompared} is not on track`;
  })();
  const label =
    ridingCode === undefined
      ? 'Onboard view, no car on track'
      : `Onboard view, riding with ${ridingCode}${versus === undefined ? '' : `, ${versus} on track too`}`;

  return (
    <section
      data-slot="onboard-view"
      aria-label={label}
      className="relative h-[min(70vh,34rem)] w-full overflow-hidden bg-[#bcd4e6]"
    >
      <Suspense
        fallback={
          <p className="absolute inset-0 grid place-items-center text-sm text-slate-700">
            Loading the Onboard view…
          </p>
        }
      >
        <OnboardScene
          race={race}
          circuit={circuit}
          replay={replay}
          followedId={followedId}
          comparedIds={comparedIds}
          camera={camera}
        />
      </Suspense>

      <div className="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1 font-mono text-xs">
        {riding && ridingCode && (
          <p data-slot="onboard-hud" className={`flex gap-3 ${LABEL}`}>
            <span className="font-semibold">{ridingCode}</span>
            <span>P{riding.position}</span>
            <span>
              Lap {riding.lap}/{race.totalLaps}
            </span>
            {versus !== undefined && <span>vs {versus}</span>}
          </p>
        )}
        {notice && (
          <p data-slot="onboard-notice" className={LABEL}>
            {notice}
          </p>
        )}
      </div>

      <div className="absolute top-2 right-2 w-[min(40%,12rem)] bg-black/50 p-1">{minimap}</div>

      <fieldset aria-label="Camera" className="absolute right-2 bottom-2 flex gap-1">
        {CAMERAS.map(({ value, label: name }) => (
          <Button
            key={value}
            size="xs"
            variant={camera === value ? 'default' : 'secondary'}
            aria-pressed={camera === value}
            onClick={() => setCamera(value)}
          >
            {name}
          </Button>
        ))}
      </fieldset>

      <p className={`pointer-events-none absolute bottom-2 left-2 text-[10px] ${LABEL}`}>
        Unofficial layout · generated surroundings · approximate motion
      </p>
    </section>
  );
}
