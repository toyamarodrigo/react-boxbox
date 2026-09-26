/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the gantry is a live region, not a form output */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { DURATION, EASE_IN_OUT, EASE_OUT } from '@/registry/boxbox/lib/motion';
import { cn } from '@/lib/utils';

export type StartLightsPhase = 'idle' | 'arming' | 'lit' | 'out' | 'aborted';
export type StartLightsCount = 0 | 1 | 2 | 3 | 4 | 5;
export type StartLightsState = { phase: StartLightsPhase; lit: StartLightsCount };
export type StartLightsAction =
  | { type: 'start' }
  | { type: 'light' }
  | { type: 'out' }
  | { type: 'abort' }
  | { type: 'reset' };

export const startLightsInitialState: StartLightsState = { phase: 'idle', lit: 0 };

export const startLightsColumns = 5;

export function startLightsReducer(
  state: StartLightsState,
  action: StartLightsAction,
): StartLightsState {
  switch (action.type) {
    case 'start':
      if (state.phase === 'arming' || state.phase === 'lit') return state;
      return { phase: 'arming', lit: 0 };
    case 'light': {
      if (state.phase !== 'arming') return state;
      const lit = (state.lit + 1) as StartLightsCount;
      return { phase: lit === startLightsColumns ? 'lit' : 'arming', lit };
    }
    case 'out':
      if (state.phase !== 'lit') return state;
      return { phase: 'out', lit: 0 };
    case 'abort':
      if (state.phase !== 'arming' && state.phase !== 'lit') return state;
      return { phase: 'aborted', lit: 5 };
    case 'reset':
      return startLightsInitialState;
  }
}

export function startLightsLabel(state: StartLightsState): string {
  switch (state.phase) {
    case 'idle':
      return 'Start lights ready';
    case 'out':
      return 'Lights out';
    case 'aborted':
      return 'Start aborted';
    default:
      return `Lights: ${state.lit} of ${startLightsColumns}`;
  }
}

export type UseStartLightsOptions = {
  autoStart?: boolean;
  interval?: number;
  holdRange?: [number, number];
  state?: StartLightsState;
  defaultState?: StartLightsState;
  onStateChange?: (state: StartLightsState) => void;
  onLight?: (index: number) => void;
  onLightsOut?: () => void;
  random?: () => number;
};

export function useStartLights({
  autoStart = false,
  interval = 1000,
  holdRange = [200, 3000],
  state: controlledState,
  defaultState = startLightsInitialState,
  onStateChange,
  onLight,
  onLightsOut,
  random = Math.random,
}: UseStartLightsOptions = {}) {
  const [uncontrolledState, setUncontrolledState] = useState(defaultState);
  const state = controlledState ?? uncontrolledState;

  // Latest values for the timer callbacks, synced before any other effect runs.
  const stateRef = useRef(state);
  const controlledRef = useRef(controlledState !== undefined);
  const callbacks = useRef({ onStateChange, onLight, onLightsOut, random });
  useEffect(() => {
    stateRef.current = state;
    controlledRef.current = controlledState !== undefined;
    callbacks.current = { onStateChange, onLight, onLightsOut, random };
  });

  const dispatch = useCallback((action: StartLightsAction) => {
    const next = startLightsReducer(stateRef.current, action);
    if (next === stateRef.current) return;
    stateRef.current = next;
    if (!controlledRef.current) setUncontrolledState(next);
    callbacks.current.onStateChange?.(next);
  }, []);

  const start = useCallback(() => dispatch({ type: 'start' }), [dispatch]);
  const abort = useCallback(() => dispatch({ type: 'abort' }), [dispatch]);
  const reset = useCallback(() => dispatch({ type: 'reset' }), [dispatch]);

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);

  const [holdMin, holdMax] = holdRange;
  const { phase, lit } = state;

  useEffect(() => {
    if (phase === 'arming') {
      const timer = setTimeout(() => {
        callbacks.current.onLight?.(lit);
        dispatch({ type: 'light' });
      }, interval);
      return () => clearTimeout(timer);
    }
    if (phase === 'lit') {
      const hold = holdMin + callbacks.current.random() * Math.max(holdMax - holdMin, 0);
      const timer = setTimeout(() => {
        callbacks.current.onLightsOut?.();
        dispatch({ type: 'out' });
      }, hold);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase, lit, interval, holdMin, holdMax, dispatch]);

  return { state, start, abort, reset };
}

export type StartLightsSize = 'sm' | 'md' | 'lg';

const sizeStyles = {
  sm: { light: 'size-3.5', glow: '0 0 8px 1px', columnGap: 'gap-1', housing: 'gap-1.5 p-2' },
  md: { light: 'size-6', glow: '0 0 14px 3px', columnGap: 'gap-1.5', housing: 'gap-2.5 p-3' },
  lg: { light: 'size-9', glow: '0 0 22px 5px', columnGap: 'gap-2', housing: 'gap-4 p-4' },
} satisfies Record<
  StartLightsSize,
  { light: string; glow: string; columnGap: string; housing: string }
>;

export function StartLight({
  on = false,
  aborted = false,
  size = 'md',
  className,
}: {
  on?: boolean;
  aborted?: boolean;
  size?: StartLightsSize;
  className?: string;
}) {
  const styles = sizeStyles[size];
  const color = aborted ? 'var(--flag-yellow)' : 'var(--primary)';
  return (
    <motion.span
      aria-hidden="true"
      data-slot="start-light"
      data-on={on ? 'true' : 'false'}
      className={cn(
        'block rounded-full',
        on ? (aborted ? 'bg-flag-yellow' : 'bg-primary') : 'bg-foreground/10',
        styles.light,
        className,
      )}
      style={on ? { boxShadow: `${styles.glow} ${color}` } : undefined}
      initial={false}
      animate={
        aborted ? { opacity: [1, 0.2, 1], scale: 1 } : { opacity: 1, scale: on ? [0.8, 1] : 1 }
      }
      transition={
        aborted
          ? { duration: 0.6, repeat: Number.POSITIVE_INFINITY, ease: EASE_IN_OUT }
          : { duration: DURATION.tick, ease: EASE_OUT }
      }
    />
  );
}

export function StartLightsColumn({
  lit = false,
  aborted = false,
  size = 'md',
  className,
  ...props
}: {
  lit?: boolean;
  aborted?: boolean;
  size?: StartLightsSize;
} & React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="start-lights-column"
      data-lit={lit ? 'true' : 'false'}
      className={cn('flex flex-col', sizeStyles[size].columnGap, className)}
      {...props}
    >
      <StartLight on={lit} aborted={aborted} size={size} />
      <StartLight on={lit} aborted={aborted} size={size} />
    </div>
  );
}

export type StartLightsProps = UseStartLightsOptions & {
  size?: StartLightsSize;
} & React.ComponentProps<'div'>;

export function StartLights({
  autoStart = false,
  interval = 1000,
  holdRange = [200, 3000],
  state: controlledState,
  defaultState,
  onStateChange,
  onLight,
  onLightsOut,
  random,
  size = 'md',
  className,
  ...props
}: StartLightsProps) {
  const { state } = useStartLights({
    autoStart,
    interval,
    holdRange,
    state: controlledState,
    defaultState,
    onStateChange,
    onLight,
    onLightsOut,
    random,
  });
  const aborted = state.phase === 'aborted';
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="start-lights"
      data-phase={state.phase}
      data-lit={state.lit}
      className={cn(
        'inline-flex items-center border border-border bg-card',
        sizeStyles[size].housing,
        className,
      )}
      {...props}
    >
      <span className="sr-only">{startLightsLabel(state)}</span>
      {Array.from({ length: startLightsColumns }, (_, index) => (
        <StartLightsColumn
          key={index}
          lit={aborted || state.lit > index}
          aborted={aborted}
          size={size}
        />
      ))}
    </div>
  );
}
