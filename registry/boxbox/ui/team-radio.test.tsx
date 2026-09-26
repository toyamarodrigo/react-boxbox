import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import {
  TeamRadio,
  envelopeWindow,
  levelFromSamples,
  spokenWords,
  teamRadioLabel,
} from '@/registry/boxbox/ui/team-radio';
import type { TeamRadioWord } from '@/registry/boxbox/ui/team-radio';

const words: TeamRadioWord[] = [
  { text: 'Box,', at: 0.2 },
  { text: 'box.', at: 0.6 },
];
// One second of message at 60 samples a second.
const envelope = Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.8 : 0.3));

const card = () => document.querySelector('[data-slot="team-radio"]');
const spoken = () =>
  [...document.querySelectorAll('[data-slot="team-radio-word"]')].map((word) =>
    word.getAttribute('data-spoken'),
  );

// jsdom has no 2D canvas and no media playback; the card must not need either.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('envelopeWindow', () => {
  it('puts the newest level on the right and silence before the start', () => {
    expect(envelopeWindow([0.1, 0.2, 0.3, 0.4], 1, 3)).toEqual([0, 0.1, 0.2]);
    expect(envelopeWindow([0.1, 0.2, 0.3, 0.4], 3, 3)).toEqual([0.2, 0.3, 0.4]);
    expect(envelopeWindow([], 0, 2)).toEqual([0, 0]);
  });
});

describe('levelFromSamples', () => {
  it('is silent at the centre line, louder with the swing, and never above one', () => {
    expect(levelFromSamples(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(levelFromSamples(new Uint8Array([]))).toBe(0);
    expect(levelFromSamples(new Uint8Array([144, 112]))).toBeCloseTo(0.375);
    expect(levelFromSamples(new Uint8Array([255, 0]))).toBe(1);
  });
});

describe('spokenWords and teamRadioLabel', () => {
  it('keeps the words spoken so far, in order, and reads the whole message', () => {
    expect(spokenWords(words, 0)).toEqual([]);
    expect(spokenWords(words, 0.2)).toEqual([words[0]]);
    expect(spokenWords(words, 1)).toEqual(words);
    expect(teamRadioLabel('RACE ENGINEER', 'EVO', words)).toBe(
      'Team radio, RACE ENGINEER to EVO: Box, box.',
    );
  });
});

describe('TeamRadio', () => {
  it('paints the header, the parties and the whole message at rest', () => {
    render(<TeamRadio from="RACE ENGINEER" to="EVO" words={words} envelope={envelope} />);
    expect(screen.getByText('TEAM RADIO')).toBeInTheDocument();
    expect(screen.getByText('RACE ENGINEER → EVO')).toBeInTheDocument();
    expect(screen.getByText('Team radio, RACE ENGINEER to EVO: Box, box.')).toBeInTheDocument();
    expect(card()).toHaveAttribute('data-playing', 'false');
    expect(spoken()).toEqual(['true', 'true']);
    // The closing full stop is the one red character.
    expect(document.querySelector('[data-slot="team-radio-word"] .text-primary')).toHaveTextContent(
      '.',
    );
    // Painted parts are hidden, so the message is read once.
    expect(document.querySelector('[data-slot="team-radio-trace"]')).toHaveAttribute('aria-hidden');
    expect(document.querySelector('[data-slot="waveform"]')).toHaveAttribute('aria-hidden');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('runs the envelope on a rising edge of play and pops each word at its time', () => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'],
    });
    const onComplete = vi.fn();
    const view = (play: boolean) => (
      <TeamRadio
        from="RACE ENGINEER"
        to="EVO"
        words={words}
        envelope={envelope}
        envelopeRate={60}
        play={play}
        onComplete={onComplete}
        bars={4}
      />
    );
    const { rerender } = render(view(false));
    expect(card()).toHaveAttribute('data-playing', 'false');

    rerender(view(true));
    act(() => vi.advanceTimersByTime(20));
    expect(card()).toHaveAttribute('data-playing', 'true');
    expect(spoken()).toEqual(['false', 'false']);

    act(() => vi.advanceTimersByTime(300));
    expect(spoken()).toEqual(['true', 'false']);

    act(() => vi.advanceTimersByTime(400));
    expect(spoken()).toEqual(['true', 'true']);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(400));
    expect(card()).toHaveAttribute('data-playing', 'false');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(spoken()).toEqual(['true', 'true']);
  });

  it('owns a play/stop control with audio, builds the analyser once and closes it on unmount', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const analyser = {
      fftSize: 0,
      getByteTimeDomainData: vi.fn((samples: Uint8Array) => samples.fill(160)),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      destination: {},
      createAnalyser: vi.fn(() => analyser),
      createMediaElementSource: vi.fn(() => ({ connect: vi.fn() })),
      resume: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
    };
    const AudioContextStub = vi.fn(function AudioContextStub() {
      return context;
    });
    vi.stubGlobal('AudioContext', AudioContextStub);

    const { unmount } = render(
      <TeamRadio from="RACE ENGINEER" to="EVO" words={words} src="/audio/box-box.wav" />,
    );
    const control = screen.getByRole('button', { name: 'Play team radio' });
    expect(control).toHaveAttribute('aria-pressed', 'false');
    // Nothing plays, and nothing is built, until the control is pressed.
    expect(AudioContextStub).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    fireEvent.click(control);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(AudioContextStub).toHaveBeenCalledTimes(1);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(analyser.fftSize).toBe(256);
    expect(screen.getByRole('button', { name: 'Stop team radio' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(card()).toHaveAttribute('data-playing', 'true');
    // The words wait for the audio clock, which jsdom leaves at zero.
    act(() => vi.advanceTimersByTime(40));
    expect(analyser.getByteTimeDomainData).toHaveBeenCalled();
    expect(spoken()).toEqual(['false', 'false']);

    fireEvent.click(screen.getByRole('button', { name: 'Stop team radio' }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(card()).toHaveAttribute('data-playing', 'false');
    expect(spoken()).toEqual(['true', 'true']);

    // A second play reuses the element and its graph.
    fireEvent.click(screen.getByRole('button', { name: 'Play team radio' }));
    expect(AudioContextStub).toHaveBeenCalledTimes(1);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);

    unmount();
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('keeps the message readable with motion disabled', () => {
    render(
      <MotionConfig reducedMotion="always">
        <TeamRadio from="RACE ENGINEER" to="EVO" words={words} envelope={envelope} size="sm" />
      </MotionConfig>,
    );
    expect(screen.getByText('Team radio, RACE ENGINEER to EVO: Box, box.')).toBeInTheDocument();
    expect(card()).toHaveAttribute('data-size', 'sm');
    expect(spoken()).toEqual(['true', 'true']);
  });
});
