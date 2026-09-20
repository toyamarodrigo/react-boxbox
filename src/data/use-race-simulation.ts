import { useEffect, useState } from 'react';
import { grid } from './grid';
import { advanceRace, createInitialRace, createSeededRng } from './simulation';

export function useRaceSimulation({
  intervalMs = 1000,
  seed = 1,
  autoPlay = true,
}: {
  intervalMs?: number;
  seed?: number;
  autoPlay?: boolean;
} = {}) {
  const [state, setState] = useState(() => createInitialRace(grid, createSeededRng(seed)));
  const [isPlaying, setIsPlaying] = useState(autoPlay);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setState((current) => advanceRace(current, createSeededRng(seed + current.lap * 0x9e3779b9)));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, isPlaying, seed]);

  const reset = () => {
    setState(createInitialRace(grid, createSeededRng(seed)));
    setIsPlaying(autoPlay);
  };
  return {
    state,
    play: () => setIsPlaying(true),
    pause: () => setIsPlaying(false),
    reset,
    isPlaying,
  };
}
