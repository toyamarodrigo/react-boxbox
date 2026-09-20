import * as React from 'react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import { cn } from '@/lib/utils';

export type ReplayBumperVariant = 'wipe' | 'slide' | 'flash';

/**
 * Phases of one bumper run, in milliseconds from its start.
 * `cover` is when the overlay finishes covering the content, `uncover` when it
 * starts to leave again. `midpoint` sits between them, so the content is fully
 * hidden while it is swapped.
 */
export function replayBumperTimeline(duration: number) {
  return { cover: duration * 0.4, midpoint: duration / 2, uncover: duration * 0.6 };
}

const WIPE_CLIP = 'polygon(12% 0, 100% 0, 88% 100%, 0 100%)';

export type ReplayBumperOverlayProps = React.ComponentProps<'div'> & {
  label?: string;
  duration?: number;
  variant?: ReplayBumperVariant;
  color?: string;
};

export function ReplayBumperOverlay({
  label = 'REPLAY',
  duration = 1200,
  variant = 'wipe',
  color = 'var(--primary)',
  className,
  ...props
}: ReplayBumperOverlayProps) {
  const timeline = replayBumperTimeline(duration);
  const transition: Transition = {
    duration: duration / 1000,
    times: [0, timeline.cover / duration, timeline.uncover / duration, 1],
    ease: ['easeOut', 'linear', 'easeIn'],
  };
  const flash = variant === 'flash';

  return (
    <div
      data-slot="replay-bumper-overlay"
      data-variant={variant}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      {...props}
    >
      <motion.div
        data-slot="replay-bumper-panel"
        className={cn(
          'absolute inset-y-0 flex items-center justify-center',
          flash ? 'inset-x-0' : '-inset-x-1/4',
        )}
        style={{ backgroundColor: color, clipPath: variant === 'wipe' ? WIPE_CLIP : undefined }}
        initial={flash ? { opacity: 0 } : { x: '-130%' }}
        animate={flash ? { opacity: [0, 1, 1, 0] } : { x: ['-130%', '0%', '0%', '130%'] }}
        transition={transition}
      >
        <motion.span
          className="font-display text-4xl font-black uppercase italic tracking-tight text-primary-foreground"
          initial={flash ? { scale: 1.2 } : false}
          animate={
            flash
              ? { scale: [1.2, 1, 1, 1] }
              : variant === 'wipe'
                ? { x: ['-30%', '0%', '0%', '30%'] }
                : { x: '0%' }
          }
          transition={transition}
        >
          {label}
        </motion.span>
      </motion.div>
    </div>
  );
}

export type ReplayBumperProps = React.ComponentProps<'div'> & {
  play: boolean;
  label?: string;
  duration?: number;
  variant?: ReplayBumperVariant;
  color?: string;
  onMidpoint?: () => void;
  onComplete?: () => void;
};

type Run = { id: number; duration: number };

export function ReplayBumper({
  children,
  play,
  label = 'REPLAY',
  duration = 1200,
  variant = 'wipe',
  color = 'var(--primary)',
  onMidpoint,
  onComplete,
  className,
  ...props
}: ReplayBumperProps) {
  // A run exists only while the bumper plays, so it also carries the playing state.
  const [run, setRun] = React.useState<Run | null>(null);
  const playing = run !== null;
  const wasPlaying = React.useRef(false);
  const runCount = React.useRef(0);
  const handlers = React.useRef({ onMidpoint, onComplete });

  React.useEffect(() => {
    handlers.current = { onMidpoint, onComplete };
  });

  // Only a rising edge of `play` starts a run; the run then owns its timing.
  React.useEffect(() => {
    if (play && !wasPlaying.current) {
      runCount.current += 1;
      setRun({ id: runCount.current, duration });
    }
    wasPlaying.current = play;
  }, [play, duration]);

  React.useEffect(() => {
    if (!run) return;
    const timeline = replayBumperTimeline(run.duration);
    const midpoint = setTimeout(() => handlers.current.onMidpoint?.(), timeline.midpoint);
    const complete = setTimeout(() => {
      setRun(null);
      handlers.current.onComplete?.();
    }, run.duration);
    return () => {
      clearTimeout(midpoint);
      clearTimeout(complete);
    };
  }, [run]);

  return (
    <div
      data-slot="replay-bumper"
      data-playing={playing}
      data-variant={variant}
      className={cn('relative', className)}
      {...props}
    >
      {children}
      <AnimatePresence>
        {run ? (
          <ReplayBumperOverlay
            key={run.id}
            label={label}
            duration={run.duration}
            variant={variant}
            color={color}
          />
        ) : null}
      </AnimatePresence>
      <output className="sr-only">{playing ? label : ''}</output>
    </div>
  );
}
