import { useEffect, useState } from 'react';

/**
 * Counts the laps of a demo race, one per tick, and starts the race again at the flag so the
 * bars fill over and over. The component owns no clock of its own; the lap comes from here.
 */
export function useRaceLap(totalLaps: number, intervalMs: number, enabled = true): number {
  const [lap, setLap] = useState(0);
  const [distance, setDistance] = useState(totalLaps);
  // Adjusting state during render: a new race distance starts the race from the grid.
  if (distance !== totalLaps) {
    setDistance(totalLaps);
    setLap(0);
  }

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    const id = setInterval(() => {
      setLap((current) => (current >= totalLaps ? 0 : current + 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, totalLaps]);

  return lap;
}
