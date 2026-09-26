import { motion, useReducedMotionConfig, type Transition } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { DURATION, EASE_OUT } from '@/registry/boxbox/lib/motion';
import { Waveform } from '@/registry/boxbox/ui/waveform';
import { cn } from '@/lib/utils';

export type TeamRadioSize = 'sm' | 'md';

// motion owns these props on its own elements, so they cannot come from the caller.
type MotionSafeProps<T extends keyof React.JSX.IntrinsicElements> = Omit<
  React.ComponentProps<T>,
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'style'
>;

/** One word of the transcript and the second of the message it is spoken at. */
export type TeamRadioWord = { text: string; at: number };

/** How many bars the sliding window shows: about a second of message at the default rate. */
export const TEAM_RADIO_BARS = 24;

/** Samples per second an `envelope` is given at, unless the caller says otherwise. */
export const TEAM_RADIO_ENVELOPE_RATE = 60;

/** The pop each word lands with: a little overshoot and a quick settle, as on the broadcast. */
export const SPRING_POP: Transition = { type: 'spring', stiffness: 520, damping: 16 };

/** The analyser's time-domain samples are bytes centred on 128; speech peaks well under full scale. */
const LEVEL_GAIN = 3;

/**
 * The bars showing at one moment of an envelope: the sample at `index` on the right and the
 * `bars - 1` before it to its left, silent (0) before the message starts. The newest level is
 * always on the right, so the trace slides left as the message plays.
 */
export function envelopeWindow(envelope: number[], index: number, bars: number): number[] {
  return Array.from({ length: bars }, (_, i) => envelope[index - (bars - 1 - i)] ?? 0);
}

/** A level 0–1 from one frame of an `AnalyserNode`'s time-domain bytes: RMS about the centre. */
export function levelFromSamples(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const centred = (sample - 128) / 128;
    sum += centred * centred;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * LEVEL_GAIN);
}

/** The words spoken by `elapsed` seconds, in order. */
export function spokenWords(words: TeamRadioWord[], elapsed: number): TeamRadioWord[] {
  return words.filter((word) => word.at <= elapsed);
}

/** What a screen reader hears for the whole card: who is talking to whom, then the message. */
export function teamRadioLabel(from: string, to: string, words: TeamRadioWord[]): string {
  return `Team radio, ${from} to ${to}: ${words.map((word) => word.text).join(' ')}`;
}

const STRIPE_SIZES: Record<TeamRadioSize, string> = { sm: 'w-1', md: 'w-1.5' };
const HEADER_SIZES: Record<TeamRadioSize, string> = { sm: 'gap-1 px-3', md: 'gap-2 px-4' };
const LABEL_SIZES: Record<TeamRadioSize, string> = { sm: 'text-[0.625rem]', md: 'text-xs' };
const SUB_SIZES: Record<TeamRadioSize, string> = { sm: 'text-[0.5625rem]', md: 'text-[0.625rem]' };
const DOT_SIZES: Record<TeamRadioSize, string> = { sm: 'size-1.5', md: 'size-2' };
const WAVE_SIZES: Record<TeamRadioSize, string> = { sm: 'px-3', md: 'px-4' };
const WORDS_SIZES: Record<TeamRadioSize, string> = {
  sm: 'gap-2 px-3 text-2xl',
  md: 'gap-4 px-5 text-4xl',
};
const BAR_SIZES: Record<TeamRadioSize, { width: number; gap: number; height: number }> = {
  sm: { width: 3, gap: 2, height: 24 },
  md: { width: 4, gap: 3, height: 40 },
};

/** The transcript as painted: the full stop closing the message is red, as on the broadcast. */
function paintedWord(word: TeamRadioWord, last: boolean) {
  if (!last || !word.text.endsWith('.')) return word.text;
  return (
    <>
      {word.text.slice(0, -1)}
      <span className="text-primary">.</span>
    </>
  );
}

/**
 * The broadcast team radio card: who is talking to whom, a live trace of the message, and its
 * transcript arriving word by word as it is spoken.
 *
 * The card wipes in from the left when it mounts, so mount it when the message comes in. At rest
 * it shows the whole transcript; a run hides the words and pops each one in at its time. Given
 * `src`, the card owns a play/stop control and never plays on its own: the trace is the real
 * level of the audio and the words follow its clock. Given an `envelope` instead, a rising edge
 * of `play` runs the message on the animation clock, `onComplete` fires at its end, and no audio
 * is involved. Under reduced motion there is no wipe, no pulse and no pop: the words appear.
 */
export function TeamRadio({
  from,
  to,
  words,
  src,
  envelope,
  envelopeRate = TEAM_RADIO_ENVELOPE_RATE,
  play = false,
  onComplete,
  bars = TEAM_RADIO_BARS,
  label = 'TEAM RADIO',
  size = 'md',
  className,
  ...props
}: {
  /** Who is speaking, as printed on the sub line: `RACE ENGINEER`. */
  from: string;
  /** Who is spoken to: a driver's three-letter code. */
  to: string;
  /** The transcript, each word with the second it is spoken at. */
  words: TeamRadioWord[];
  /** The message as audio. The card renders its own play/stop control for it. */
  src?: string;
  /**
   * The message as levels 0–1 at `envelopeRate` samples per second, for a card with no audio.
   * Keep the array stable between renders: a new one restarts a run in progress.
   */
  envelope?: number[];
  envelopeRate?: number;
  /** Envelope mode only: a rising edge runs the message from the start. */
  play?: boolean;
  /** Called when a run reaches the end of the message. */
  onComplete?: () => void;
  /** How many bars the trace shows. The column is sized to fit exactly this many. */
  bars?: number;
  label?: string;
  size?: TeamRadioSize;
} & MotionSafeProps<'div'>) {
  const reduced = useReducedMotionConfig() ?? false;
  const bar = BAR_SIZES[size];
  const sentence = teamRadioLabel(from, to, words);

  // `null` is rest: the whole transcript shows. A number is the clock of a run in seconds.
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [levels, setLevels] = useState<number[]>(() =>
    envelope ? envelopeWindow(envelope, envelope.length - 1, bars) : envelopeWindow([], 0, bars),
  );
  const playing = elapsed !== null;

  const handlers = useRef({ onComplete });
  useEffect(() => {
    handlers.current = { onComplete };
  });

  // Envelope mode: one run per rising edge of `play`, on the animation clock. The first frame
  // clears the trace, so no state is set in the effect itself.
  useEffect(() => {
    if (!play || src || !envelope) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const seconds = (now - start) / 1000;
      const index = Math.floor(seconds * envelopeRate);
      if (index >= envelope.length) {
        setElapsed(null);
        setLevels(envelopeWindow(envelope, envelope.length - 1, bars));
        handlers.current.onComplete?.();
        return;
      }
      setElapsed(seconds);
      setLevels(envelopeWindow(envelope, index, bars));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play, src, envelope, envelopeRate, bars]);

  // Audio mode. The element and its analyser graph are built on the first play, off the DOM
  // (the transcript is the caption), and live until the card unmounts. Without Web Audio the
  // clip still plays and the words still follow it; only the trace stays flat.
  const player = useRef<{
    audio: HTMLAudioElement;
    context: AudioContext | null;
    analyser: AnalyserNode | null;
  } | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
      const built = player.current;
      if (!built) return;
      player.current = null;
      built.audio.pause();
      built.analyser?.disconnect();
      void built.context?.close();
    };
  }, []);

  const finish = () => {
    cancelAnimationFrame(frameRef.current);
    setElapsed(null);
    handlers.current.onComplete?.();
  };

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    const built = player.current;
    if (built) {
      built.audio.pause();
      built.audio.currentTime = 0;
    }
    setElapsed(null);
  };

  const build = (url: string) => {
    const audio = new Audio(url);
    audio.preload = 'metadata';
    audio.addEventListener('ended', finish);
    if (typeof AudioContext === 'undefined') return { audio, context: null, analyser: null };
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaElementSource(audio).connect(analyser);
    analyser.connect(context.destination);
    return { audio, context, analyser };
  };

  const start = () => {
    if (src === undefined) return;
    const built = (player.current ??= build(src));
    const { audio, analyser } = built;
    void built.context?.resume();
    const samples = new Uint8Array(analyser?.fftSize ?? 0);
    setElapsed(0);
    setLevels(envelopeWindow([], 0, bars));
    const tick = () => {
      if (analyser) {
        analyser.getByteTimeDomainData(samples);
        const level = levelFromSamples(samples);
        setLevels((previous) => [...previous.slice(1), level]);
      }
      setElapsed(audio.currentTime);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    audio.play().catch(stop);
  };

  const spoken = elapsed === null ? words : spokenWords(words, elapsed);

  return (
    <motion.div
      data-slot="team-radio"
      data-size={size}
      data-playing={playing ? 'true' : 'false'}
      initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0 0 0)' }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT }}
      className={cn(
        'inline-flex items-stretch border border-border bg-card text-card-foreground',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        data-slot="team-radio-stripe"
        className={cn('shrink-0 bg-primary', STRIPE_SIZES[size])}
      />
      <span
        aria-hidden
        data-slot="team-radio-header"
        className={cn(
          'flex shrink-0 flex-col justify-center py-2 font-mono uppercase leading-none',
          HEADER_SIZES[size],
        )}
      >
        <span className={cn('flex items-center gap-2 tracking-[0.28em]', LABEL_SIZES[size])}>
          <motion.span
            data-slot="team-radio-live"
            className={cn('shrink-0 rounded-full bg-primary', DOT_SIZES[size])}
            animate={
              playing && !reduced ? { opacity: [0.35, 1, 0.35] } : { opacity: playing ? 1 : 0.35 }
            }
            transition={
              playing && !reduced
                ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
                : { duration: DURATION.fast }
            }
          />
          {label}
        </span>
        <span className={cn('tracking-[0.24em] text-muted-foreground', SUB_SIZES[size])}>
          {from} → {to}
        </span>
      </span>
      <span
        aria-hidden
        data-slot="team-radio-trace"
        className={cn('flex items-center border-x border-border', WAVE_SIZES[size])}
      >
        <Waveform
          data={levels}
          barWidth={bar.width}
          barGap={bar.gap}
          barRadius={0}
          barHeight={2}
          height={bar.height}
          fadeWidth={bar.width * 3}
          style={{ width: bars * (bar.width + bar.gap) }}
        />
      </span>
      <p
        data-slot="team-radio-transcript"
        className={cn(
          'flex items-center font-display font-black italic leading-none tracking-tight',
          WORDS_SIZES[size],
        )}
      >
        <span className="sr-only">{sentence}</span>
        {words.map((word, index) => {
          const shown = spoken.includes(word);
          return (
            <motion.span
              key={index}
              aria-hidden
              data-slot="team-radio-word"
              data-spoken={shown ? 'true' : 'false'}
              className="inline-block origin-left whitespace-nowrap"
              initial={false}
              animate={{ transform: shown ? 'scale(1)' : 'scale(0)' }}
              transition={shown && !reduced ? SPRING_POP : { duration: 0 }}
            >
              {paintedWord(word, index === words.length - 1)}
            </motion.span>
          );
        })}
      </p>
      {src !== undefined && (
        <button
          type="button"
          data-slot="team-radio-control"
          aria-label={playing ? 'Stop team radio' : 'Play team radio'}
          aria-pressed={playing}
          onClick={playing ? stop : start}
          className="flex shrink-0 items-center border-l border-border px-3 text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <svg aria-hidden viewBox="0 0 12 12" className="size-3 fill-current">
            {playing ? <rect x="1" y="1" width="10" height="10" /> : <path d="M2 1l9 5-9 5z" />}
          </svg>
        </button>
      )}
    </motion.div>
  );
}
