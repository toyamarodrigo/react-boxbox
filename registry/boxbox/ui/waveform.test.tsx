import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Waveform } from '@/registry/boxbox/ui/waveform';

// jsdom has no 2D canvas. A recording stand-in lets the drawing be checked without one.
function fakeContext(width: number, height: number) {
  const calls: [number, number, number, number][] = [];
  const ctx = {
    clearRect: vi.fn(),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push([x, y, w, h]),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { ctx, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Waveform', () => {
  it('renders a canvas that assistive technology does not see', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(<Waveform data={[0.2, 0.8]} height={40} />);
    const root = container.querySelector('[data-slot="waveform"]');
    expect(root).toHaveAttribute('aria-hidden');
    expect(root).toHaveStyle({ height: '40px' });
    expect(root?.querySelector('canvas')).toBeInTheDocument();
  });

  it('draws one square bar per step, silent bars kept at the base height', () => {
    // 70 px wide at 4 + 3 px a bar: ten bars, the fade pass drawn over them.
    const { calls } = fakeContext(70, 40);
    render(<Waveform data={[0, 1]} barWidth={4} barGap={3} barHeight={2} height={40} />);
    const bars = calls.filter(([, , w]) => w === 4);
    expect(bars).toHaveLength(10);
    // The first half is silent: base height, centred. The second half is full: 80 % of the box.
    expect(bars[0]).toEqual([0, 19, 4, 2]);
    expect(bars[5]).toEqual([35, 4, 4, 32]);
    // The edge fade covers the whole box once.
    expect(calls.filter(([, , w, h]) => w === 70 && h === 40)).toHaveLength(1);
  });

  it('skips the fade when asked, and rounds bars only when given a radius', () => {
    const { ctx, calls } = fakeContext(70, 40);
    render(<Waveform data={[1]} barWidth={4} barGap={3} fadeEdges={false} barRadius={2} />);
    expect(calls).toHaveLength(0);
    expect(ctx.roundRect).toHaveBeenCalledTimes(10);
  });

  it('repaints when the theme changes on the root', async () => {
    const { ctx } = fakeContext(70, 40);
    render(<Waveform data={[1]} barWidth={4} barGap={3} />);
    ctx.clearRect.mockClear();
    document.documentElement.classList.toggle('dark');
    await waitFor(() => expect(ctx.clearRect).toHaveBeenCalledTimes(1));
    document.documentElement.classList.toggle('dark');
  });
});
