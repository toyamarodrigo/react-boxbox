import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { grid } from '@/data/grid';
import { useRaceSimulation } from '@/data/use-race-simulation';
import { StartLights } from '@/registry/boxbox/ui/start-lights';
import { TimingTower } from '@/registry/boxbox/ui/timing-tower';
import { Button } from '@/components/ui/button';

const driversById = Object.fromEntries(grid.drivers.map((driver) => [driver.id, driver]));
const teamsById = Object.fromEntries(grid.teams.map((team) => [team.id, team]));

const ROWS_SMALL = 8;
const ROWS_WIDE = 12;
const WIDE_QUERY = '(min-width: 768px)';

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type HeroSequenceProps = {
  /** Milliseconds between each light coming on. */
  interval?: number;
  /** Range the gantry holds on five lights before going out. */
  holdRange?: [number, number];
  /** Source of randomness for the hold, so tests can pin it. */
  random?: () => number;
  /** Milliseconds between simulated laps once the tower is live. */
  simulationIntervalMs?: number;
};

/**
 * The home stage: the start lights arm and go out, then the live timing tower
 * takes their place. `Restart` re-arms the gantry and rewinds the race.
 */
export function HeroSequence({
  interval = 900,
  holdRange = [800, 2400],
  random,
  simulationIntervalMs = 1100,
}: HeroSequenceProps) {
  const [run, setRun] = useState(0);
  const [live, setLive] = useState(false);
  const { state, play, reset } = useRaceSimulation({
    intervalMs: simulationIntervalMs,
    autoPlay: false,
  });
  const maxRows = useMediaQuery(WIDE_QUERY) ? ROWS_WIDE : ROWS_SMALL;

  const fastestLapDriverId = useMemo(() => {
    const best = state.sessionBest.lap;
    if (best === null) return null;
    return state.rows.find((row) => row.bestLapTime === best)?.driverId ?? null;
  }, [state]);

  function restart() {
    setLive(false);
    reset();
    setRun((current) => current + 1);
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="grid min-h-[20rem] w-full place-items-center md:min-h-[24rem]">
        <AnimatePresence initial={false}>
          {live ? (
            <motion.div
              key={`tower-${run}`}
              className="col-start-1 row-start-1 w-full max-w-56 md:max-w-64"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between border border-b-0 border-border bg-card px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="text-primary">Live timing</span>
                <span>{`LAP ${state.lap} / ${state.totalLaps}`}</span>
              </div>
              <TimingTower
                rows={state.rows}
                drivers={driversById}
                teams={teamsById}
                mode="interval"
                maxRows={maxRows}
                highlightTop={1}
                fastestLapDriverId={fastestLapDriverId}
                className="w-full"
              />
            </motion.div>
          ) : (
            <motion.div
              key={`lights-${run}`}
              className="col-start-1 row-start-1"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <StartLights
                key={run}
                autoStart
                size="lg"
                interval={interval}
                holdRange={holdRange}
                random={random}
                onLightsOut={() => {
                  setLive(true);
                  play();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Button variant="outline" size="sm" onClick={restart}>
        <RotateCcw aria-hidden="true" />
        Restart
      </Button>
    </div>
  );
}
