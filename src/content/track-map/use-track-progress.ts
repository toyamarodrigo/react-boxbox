import { useEffect, useState } from 'react';

/** Cars are spread round the lap so the field is never bunched at the line. */
const startAt = (index: number) => (index * 0.11) % 1;

/** A seeded, slightly different speed per car, so the pack spreads and laps wrap apart. */
const speedOf = (index: number) => 0.018 + ((index * 7) % 5) * 0.0016;

const lapFrom = (count: number) => Array.from({ length: count }, (_, index) => startAt(index));

/**
 * Walks each car round the lap, one step per tick.
 *
 * Every car has its own speed, so they separate over a few laps and cross the
 * start/finish line at different moments. Progress wraps at 1, which is exactly the
 * jump the map's marker has to survive without running the car backwards.
 */
export function useTrackProgress(count: number, intervalMs: number, enabled = true): number[] {
  const [progress, setProgress] = useState(() => lapFrom(count));
  const [size, setSize] = useState(count);
  // Adjusting state during render: a new car count restarts the field immediately.
  if (size !== count) {
    setSize(count);
    setProgress(lapFrom(count));
  }

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    const id = setInterval(() => {
      setProgress((current) => current.map((value, index) => (value + speedOf(index)) % 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);

  return progress;
}
