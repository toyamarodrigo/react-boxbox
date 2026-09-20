import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  StartLights,
  startLightsInitialState,
  startLightsLabel,
  startLightsReducer,
} from './start-lights';
import type { StartLightsState } from './start-lights';

const idle: StartLightsState = startLightsInitialState;
const arming = (lit: StartLightsState['lit']): StartLightsState => ({ phase: 'arming', lit });
const lit: StartLightsState = { phase: 'lit', lit: 5 };

describe('startLightsReducer', () => {
  it('arms from idle, out, and aborted but never mid-sequence', () => {
    expect(startLightsReducer(idle, { type: 'start' })).toEqual(arming(0));
    expect(startLightsReducer({ phase: 'out', lit: 0 }, { type: 'start' })).toEqual(arming(0));
    expect(startLightsReducer({ phase: 'aborted', lit: 5 }, { type: 'start' })).toEqual(arming(0));
    expect(startLightsReducer(arming(2), { type: 'start' })).toEqual(arming(2));
    expect(startLightsReducer(lit, { type: 'start' })).toEqual(lit);
  });

  it('lights one column at a time until all five are lit', () => {
    let state = startLightsReducer(idle, { type: 'start' });
    for (let index = 1; index < 5; index += 1) {
      state = startLightsReducer(state, { type: 'light' });
      expect(state).toEqual(arming(index as StartLightsState['lit']));
    }
    expect(startLightsReducer(state, { type: 'light' })).toEqual(lit);
    expect(startLightsReducer(lit, { type: 'light' })).toEqual(lit);
    expect(startLightsReducer(idle, { type: 'light' })).toEqual(idle);
  });

  it('goes out only from lit', () => {
    expect(startLightsReducer(lit, { type: 'out' })).toEqual({ phase: 'out', lit: 0 });
    expect(startLightsReducer(arming(3), { type: 'out' })).toEqual(arming(3));
    expect(startLightsReducer(idle, { type: 'out' })).toEqual(idle);
  });

  it('aborts from arming and lit only', () => {
    expect(startLightsReducer(arming(3), { type: 'abort' })).toEqual({ phase: 'aborted', lit: 5 });
    expect(startLightsReducer(lit, { type: 'abort' })).toEqual({ phase: 'aborted', lit: 5 });
    expect(startLightsReducer(idle, { type: 'abort' })).toEqual(idle);
    expect(startLightsReducer({ phase: 'out', lit: 0 }, { type: 'abort' })).toEqual({
      phase: 'out',
      lit: 0,
    });
  });

  it('resets from every phase', () => {
    for (const state of [idle, arming(2), lit, { phase: 'out', lit: 0 } as const]) {
      expect(startLightsReducer(state, { type: 'reset' })).toEqual(idle);
    }
  });

  it('describes each phase', () => {
    expect(startLightsLabel(idle)).toBe('Start lights ready');
    expect(startLightsLabel(arming(3))).toBe('Lights: 3 of 5');
    expect(startLightsLabel({ phase: 'out', lit: 0 })).toBe('Lights out');
    expect(startLightsLabel({ phase: 'aborted', lit: 5 })).toBe('Start aborted');
  });
});

function Controlled(props: { onLight?: (index: number) => void; onLightsOut?: () => void }) {
  const [state, setState] = useState<StartLightsState>(startLightsInitialState);
  return (
    <>
      <StartLights
        state={state}
        onStateChange={setState}
        interval={1000}
        holdRange={[200, 3000]}
        random={() => 0.5}
        onLight={props.onLight}
        onLightsOut={props.onLightsOut}
      />
      <button
        type="button"
        onClick={() => setState((s) => startLightsReducer(s, { type: 'start' }))}
      >
        Start
      </button>
      <button
        type="button"
        onClick={() => setState((s) => startLightsReducer(s, { type: 'abort' }))}
      >
        Abort
      </button>
    </>
  );
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('StartLights sequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lights a column per interval, then goes out after the random hold', () => {
    const onLight = vi.fn();
    const onLightsOut = vi.fn();
    render(<Controlled onLight={onLight} onLightsOut={onLightsOut} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'arming');

    for (let index = 0; index < 5; index += 1) {
      advance(1000);
      expect(onLight).toHaveBeenNthCalledWith(index + 1, index);
      expect(screen.getByRole('status')).toHaveAttribute('data-lit', String(index + 1));
    }
    expect(onLight).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'lit');
    expect(screen.getByText('Lights: 5 of 5')).toBeInTheDocument();

    // random 0.5 over [200, 3000] gives a 1600ms hold.
    advance(1599);
    expect(onLightsOut).not.toHaveBeenCalled();
    advance(1);
    expect(onLightsOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'out');
    expect(screen.getByRole('status')).toHaveAttribute('data-lit', '0');
    expect(screen.getByText('Lights out')).toBeInTheDocument();
  });

  it('aborts mid-sequence without going out', () => {
    const onLight = vi.fn();
    const onLightsOut = vi.fn();
    render(<Controlled onLight={onLight} onLightsOut={onLightsOut} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    advance(1000);
    advance(1000);
    expect(onLight).toHaveBeenNthCalledWith(1, 0);
    expect(onLight).toHaveBeenNthCalledWith(2, 1);

    fireEvent.click(screen.getByRole('button', { name: 'Abort' }));
    advance(10000);
    expect(onLightsOut).not.toHaveBeenCalled();
    expect(onLight).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'aborted');
    expect(screen.getByText('Start aborted')).toBeInTheDocument();
  });

  it('auto-starts and clears its timers on unmount', () => {
    const onLight = vi.fn();
    const onLightsOut = vi.fn();
    const view = render(
      <StartLights
        autoStart
        interval={500}
        holdRange={[200, 3000]}
        random={() => 0.5}
        onLight={onLight}
        onLightsOut={onLightsOut}
      />,
    );
    advance(500);
    expect(onLight).toHaveBeenCalledTimes(1);

    view.unmount();
    advance(20000);
    expect(onLight).toHaveBeenCalledTimes(1);
    expect(onLightsOut).not.toHaveBeenCalled();
  });
});

describe('StartLights rendering', () => {
  it('renders five columns of two lights for every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const view = render(<StartLights size={size} defaultState={{ phase: 'arming', lit: 2 }} />);
      const root = view.container.querySelector('[data-slot="start-lights"]');
      const columns = view.container.querySelectorAll('[data-slot="start-lights-column"]');
      const lights = view.container.querySelectorAll('[data-slot="start-light"]');
      expect(root).toHaveAttribute('data-phase', 'arming');
      expect(columns).toHaveLength(5);
      expect(lights).toHaveLength(10);
      expect([...columns].map((column) => column.getAttribute('data-lit'))).toEqual([
        'true',
        'true',
        'false',
        'false',
        'false',
      ]);
      view.unmount();
    }
  });

  it('forwards className and extra div props', () => {
    const view = render(<StartLights className="custom" id="gantry" />);
    const root = view.container.querySelector('[data-slot="start-lights"]');
    expect(root).toHaveClass('custom');
    expect(root).toHaveAttribute('id', 'gantry');
    expect(root).toHaveAttribute('aria-live', 'polite');
  });
});
