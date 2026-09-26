import { useEffect, useState } from 'react';
import type { Rng } from '@/data/simulation';
import { createSeededRng } from '@/data/simulation';

/** Where the engine is at one moment: revolutions, the gear, and whether the driver is on it. */
export type EngineState = { rpm: number; gear: number; throttle: number };

export const ENGINE_GEARS = 8;
export const ENGINE_IDLE = 3_800;
/** Revolutions the driver pulls the next gear at. */
export const ENGINE_SHIFT_UP = 11_900;
/** Revolutions lost to the taller gear on an upshift, and picked back up on a downshift. */
const SHIFT_DROP = 2_600;
/** Revolutions lost per tick with the driver off the throttle. */
const LIFT_DROP = 1_100;
/** Bottom of a braking zone: the box comes down a gear here. */
const DOWNSHIFT_AT = 6_200;
/** How hard the engine pulls in a gear. The taller the gear, the slower it climbs. */
const climbFor = (gear: number) => 900 - gear * 70;

/**
 * One tick of an invented engine: it pulls through the gear, shifts up near the limiter, and now
 * and then the driver lifts early and brings the box back down for a corner. Nothing here is
 * telemetry — there is no gear or engine speed in the data this project uses.
 */
export function advanceEngine(state: EngineState, rng: Rng): EngineState {
  if (state.throttle === 0) {
    const rpm = state.rpm - LIFT_DROP;
    // Down through the box while the car slows, one gear per pass under the threshold.
    if (rpm <= DOWNSHIFT_AT && state.gear > 2) {
      return { rpm: rpm + SHIFT_DROP, gear: state.gear - 1, throttle: 0 };
    }
    // Apex: back on the power in the gear the corner is taken in.
    if (rpm <= ENGINE_IDLE) return { rpm: ENGINE_IDLE, gear: state.gear, throttle: 1 };
    return { ...state, rpm };
  }

  const rpm = state.rpm + climbFor(state.gear);
  if (rpm >= ENGINE_SHIFT_UP) {
    // Top gear holds against the limiter until the driver lifts for the next corner.
    if (state.gear >= ENGINE_GEARS) {
      return { rpm: Math.min(rpm, ENGINE_SHIFT_UP + 200), gear: ENGINE_GEARS, throttle: 0 };
    }
    return { rpm: rpm - SHIFT_DROP, gear: state.gear + 1, throttle: 1 };
  }
  // An early lift here and there keeps the profile from being one loop over and over.
  if (state.gear >= 4 && rng() < 0.06) return { ...state, rpm, throttle: 0 };
  return { ...state, rpm, throttle: 1 };
}

const INITIAL: EngineState = { rpm: ENGINE_IDLE, gear: 1, throttle: 1 };

/**
 * Runs the invented engine for the Gauge demo, twenty times a second by default. The seed is
 * folded with the tick count rather than held in a ref, so the same seed always drives the same
 * lap and a re-mounted hook does not drift.
 */
export function useEngine({
  intervalMs = 50,
  running = true,
  seed = 7,
}: { intervalMs?: number; running?: boolean; seed?: number } = {}): EngineState {
  const [engine, setEngine] = useState<EngineState & { tick: number }>(() => ({
    ...INITIAL,
    tick: 0,
  }));

  useEffect(() => {
    if (!running || intervalMs <= 0) return;
    const id = setInterval(() => {
      setEngine((current) => ({
        ...advanceEngine(current, createSeededRng(seed + current.tick * 0x9e3779b9)),
        tick: current.tick + 1,
      }));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, running, seed]);

  return { rpm: engine.rpm, gear: engine.gear, throttle: engine.throttle };
}
