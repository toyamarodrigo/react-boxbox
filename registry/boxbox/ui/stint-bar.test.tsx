import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  StintBar,
  type StintBarStint,
  stintBarLabel,
  stintSpan,
} from '@/registry/boxbox/ui/stint-bar';

/** A two-stop race over 57 laps: medium, hard, soft. */
const STINTS: StintBarStint[] = [
  { compound: 'M', fromLap: 1, toLap: 18 },
  { compound: 'H', fromLap: 19, toLap: 40 },
  { compound: 'S', fromLap: 41, toLap: 57 },
];

const segments = () => [...document.querySelectorAll('[data-slot="stint-bar-segment"]')];
const compounds = () => segments().map((segment) => segment.getAttribute('data-compound'));

describe('stintSpan', () => {
  it('counts the whole stint without a current lap', () => {
    expect(stintSpan({ fromLap: 19, toLap: 40 })).toBe(22);
    expect(stintSpan({ fromLap: 7, toLap: 7 })).toBe(1);
  });

  it('counts only the laps run at the current lap', () => {
    expect(stintSpan({ fromLap: 19, toLap: 40 }, 25)).toBe(7);
    expect(stintSpan({ fromLap: 19, toLap: 40 }, 99)).toBe(22);
    expect(stintSpan({ fromLap: 19, toLap: 40 }, 18)).toBe(0);
    expect(stintSpan({ fromLap: 19, toLap: 40 }, 0)).toBe(0);
  });

  it('tidies laps that are fractional, reversed, or before lap one', () => {
    expect(stintSpan({ fromLap: 0, toLap: 3 })).toBe(3);
    expect(stintSpan({ fromLap: 5, toLap: 2 })).toBe(1);
    expect(stintSpan({ fromLap: 1, toLap: 4.8 })).toBe(4);
  });
});

describe('stintBarLabel', () => {
  it('reads the strategy as a sentence', () => {
    expect(stintBarLabel(STINTS, 57)).toBe(
      '3 stints: medium laps 1–18, hard laps 19–40, soft laps 41–57',
    );
  });

  it('describes the race so far when there is a current lap', () => {
    expect(stintBarLabel(STINTS, 57, 22)).toBe('2 stints: medium laps 1–18, hard laps 19–22');
    expect(stintBarLabel(STINTS, 57, 1)).toBe('1 stint: medium lap 1');
  });

  it('names a stint with no compound rather than leaving a gap', () => {
    expect(stintBarLabel([{ fromLap: 1, toLap: 30 }], 58)).toBe(
      '1 stint: unknown compound laps 1–30',
    );
  });

  it('says so when nothing has been run yet', () => {
    expect(stintBarLabel(STINTS, 57, 0)).toBe('No stints in 57 laps');
    expect(stintBarLabel([], 57)).toBe('No stints in 57 laps');
  });
});

describe('StintBar', () => {
  it('draws one segment per stint, placed on the race by lap', () => {
    render(<StintBar stints={STINTS} totalLaps={57} />);

    const bar = document.querySelector('[data-slot="stint-bar"]');
    expect(bar).toHaveAttribute('data-total-laps', '57');
    expect(bar).not.toHaveAttribute('data-current-lap');
    expect(compounds()).toEqual(['M', 'H', 'S']);
    expect(segments()[1]).toHaveAttribute('data-laps', '22');
    expect(segments()[1]?.getAttribute('style')).toContain('grid-column: 19 / span 22');
    expect(screen.getByText(/^3 stints: medium laps 1–18/)).toHaveClass('sr-only');
  });

  it('marks a stint with no compound as unknown and names it on hover', () => {
    render(
      <StintBar
        stints={[
          { compound: 'S', fromLap: 1, toLap: 20 },
          { compound: null, fromLap: 21, toLap: 58 },
        ]}
        totalLaps={58}
      />,
    );

    expect(compounds()).toEqual(['S', 'unknown']);
    const unknown = segments()[1];
    expect(unknown).toHaveAttribute('title', 'compound unknown');
    expect(unknown).toHaveTextContent('?');
    expect(segments()[0]).not.toHaveAttribute('title');
  });

  it('shows a compound letter only on a wide segment of a medium bar', () => {
    const stints: StintBarStint[] = [
      { compound: 'H', fromLap: 1, toLap: 6 },
      { compound: 'S', fromLap: 7, toLap: 11 },
    ];
    const { unmount } = render(<StintBar stints={stints} totalLaps={11} />);

    expect(segments()[0]).toHaveAttribute('data-wide', 'true');
    expect(segments()[0]).toHaveTextContent('H');
    // Five laps is under the threshold, so the letter is left off rather than clipped.
    expect(segments()[1]).not.toHaveAttribute('data-wide');
    expect(segments()[1]).toHaveTextContent('');
    unmount();

    // A small bar is a few pixels tall: no glyph fits at any width.
    render(<StintBar stints={stints} totalLaps={11} size="sm" />);
    expect(document.querySelector('[data-slot="stint-bar"]')).toHaveAttribute('data-size', 'sm');
    expect(segments().some((segment) => segment.hasAttribute('data-wide'))).toBe(false);
    expect(segments()[0]).toHaveTextContent('');
  });

  it('clips the laps still to come at the current lap', () => {
    const { rerender } = render(<StintBar stints={STINTS} totalLaps={57} currentLap={19} />);

    const future = document.querySelector<HTMLElement>('[data-slot="stint-bar-future"]');
    expect(document.querySelector('[data-slot="stint-bar"]')).toHaveAttribute(
      'data-current-lap',
      '19',
    );
    // 19 of 57 laps run, so the cover starts a third of the way along.
    expect(future?.style.clipPath).toBe('inset(0 0 0 33.33%)');

    rerender(<StintBar stints={STINTS} totalLaps={57} currentLap={57} />);
    expect(future?.style.clipPath).toBe('inset(0 0 0 100%)');
    // Only the laps run are spoken, so the bar never gives the strategy away.
    expect(screen.getByText(/^3 stints:/)).toBeInTheDocument();
  });

  it('clamps a current lap outside the race and keeps the track whole', () => {
    render(<StintBar stints={[{ compound: 'M', fromLap: 1, toLap: 80 }]} totalLaps={57} />);

    // A stint longer than the race cannot add columns, or every lap would shrink.
    expect(segments()[0]?.getAttribute('style')).toContain('grid-column: 1 / span 57');
  });

  it('takes a summary of its own', () => {
    render(<StintBar stints={STINTS} totalLaps={57} label="Strategy: two stops" />);
    expect(screen.getByText('Strategy: two stops')).toHaveClass('sr-only');
  });
});
