import { describe, expect, it } from 'vitest';
import {
  ROLL,
  WHEEL_SPIN_MAX,
  cornerRoll,
  rearLightLevel,
  suspensionBob,
  wheelSpin,
} from './car-motion';

describe('wheelSpin', () => {
  it('turns a wheel by its rolled distance over its radius', () => {
    expect(wheelSpin(0.36, 0.36)).toBeCloseTo(1);
    expect(wheelSpin(-0.18, 0.36)).toBeCloseTo(-0.5);
    expect(wheelSpin(0, 0.36)).toBe(0);
  });

  it('clamps a seek across the circuit to a turn either way', () => {
    expect(wheelSpin(500, 0.36)).toBe(WHEEL_SPIN_MAX);
    expect(wheelSpin(-500, 0.36)).toBe(-WHEEL_SPIN_MAX);
  });

  it('does not turn a wheel of no size or on a broken distance', () => {
    expect(wheelSpin(1, 0)).toBe(0);
    expect(wheelSpin(Number.NaN, 0.36)).toBe(0);
  });
});

describe('cornerRoll', () => {
  // 60 m/s round a 200 m radius: 1.8 g, a right turn.
  const speed = 60;
  const radius = 200;
  const seconds = 1 / 60;
  const distance = speed * seconds;
  const headingDelta = distance / radius;

  it('leans the body out of the corner by its lateral g', () => {
    const roll = cornerRoll(headingDelta, distance, seconds);
    expect(roll).toBeCloseTo(-((speed * speed) / radius / 9.81) * ROLL.radPerG, 5);
    expect(cornerRoll(-headingDelta, distance, seconds)).toBeCloseTo(-roll, 5);
  });

  it('stays within the most a formula car rolls', () => {
    expect(cornerRoll(headingDelta * 20, distance, seconds)).toBe(-ROLL.maxRad);
    expect(cornerRoll(-headingDelta * 20, distance, seconds)).toBe(ROLL.maxRad);
  });

  it('is level standing still, on a straight, and without time', () => {
    expect(cornerRoll(0.1, 0, seconds)).toBe(0);
    expect(cornerRoll(0, distance, seconds) + 0).toBe(0);
    expect(cornerRoll(headingDelta, distance, 0)).toBe(0);
  });
});

describe('suspensionBob', () => {
  it('trembles a few millimetres and changes with the distance', () => {
    const samples = Array.from({ length: 200 }, (_, index) => suspensionBob(index * 0.37));
    expect(Math.max(...samples.map(Math.abs))).toBeLessThan(0.006);
    expect(new Set(samples.map((bob) => bob.toFixed(5))).size).toBeGreaterThan(100);
    expect(suspensionBob(Number.NaN)).toBe(0);
  });
});

describe('rearLightLevel', () => {
  it('burns full under a safety car, a virtual one or a red flag, dim otherwise', () => {
    expect(rearLightLevel('sc')).toBe(1);
    expect(rearLightLevel('vsc')).toBe(1);
    expect(rearLightLevel('red')).toBe(1);
    expect(rearLightLevel('green')).toBeLessThan(0.5);
    expect(rearLightLevel('yellow')).toBeLessThan(0.5);
  });
});
