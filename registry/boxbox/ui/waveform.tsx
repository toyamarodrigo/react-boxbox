/**
 * Adapted from ElevenLabs UI (https://github.com/elevenlabs/ui), `waveform.tsx`.
 * Copyright (c) 2025 Eleven Labs Inc. Licensed under the MIT License.
 *
 * Only the base `Waveform` is kept: the microphone, recording, scrubbing and scrolling variants
 * are dropped, and the bar click handler with them. Bars default to square and the colour to
 * the theme's `--foreground`, so the canvas follows the page's colour scheme.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type WaveformProps = React.ComponentProps<'div'> & {
  /** One level per bar, 0–1. More levels than bars are resampled; fewer are stretched. */
  data?: number[];
  barWidth?: number;
  /** The height a silent bar keeps, so the trace never disappears. */
  barHeight?: number;
  barGap?: number;
  barRadius?: number;
  /** Any CSS colour. Defaults to the computed `--foreground`. */
  barColor?: string;
  /** Fades the two ends of the trace out, so a sliding window has no hard edge. */
  fadeEdges?: boolean;
  fadeWidth?: number;
  height?: string | number;
};

/**
 * A row of level bars on a canvas, redrawn whenever the levels or the box change. The canvas is
 * scaled to the device pixel ratio so the bars stay crisp; the container carries the size.
 */
export function Waveform({
  data = [],
  barWidth = 4,
  barHeight: baseBarHeight = 4,
  barGap = 2,
  barRadius = 0,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = 128,
  className,
  style,
  ...props
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderWaveform = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Layout size, not `getBoundingClientRect`: a scaled ancestor must not shrink the drawing.
      const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
      ctx.clearRect(0, 0, rect.width, rect.height);

      const computedBarColor =
        barColor || getComputedStyle(canvas).getPropertyValue('--foreground') || '#000';

      const barCount = Math.floor(rect.width / (barWidth + barGap));
      const centerY = rect.height / 2;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * data.length);
        const value = data[dataIndex] || 0;
        const barHeight = Math.max(baseBarHeight, value * rect.height * 0.8);
        const x = i * (barWidth + barGap);
        const y = centerY - barHeight / 2;

        ctx.fillStyle = computedBarColor;
        ctx.globalAlpha = 0.3 + value * 0.7;

        if (barRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, barRadius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      }

      if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
        const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
        const fadePercent = Math.min(0.2, fadeWidth / rect.width);

        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(fadePercent, 'rgba(255,255,255,0)');
        gradient.addColorStop(1 - fadePercent, 'rgba(255,255,255,0)');
        gradient.addColorStop(1, 'rgba(255,255,255,1)');

        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.globalAlpha = 1;
    };

    const resizeObserver = new ResizeObserver(() => {
      const rect = { width: container.clientWidth, height: container.clientHeight };
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        renderWaveform();
      }
    });

    resizeObserver.observe(container);
    renderWaveform();

    // The colour is read at draw time, so a theme switch on the root (a `dark` class, a
    // `data-theme`, inline variables) repaints the bars instead of leaving the old colour.
    const themeObserver = new MutationObserver(renderWaveform);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [data, barWidth, baseBarHeight, barGap, barRadius, barColor, fadeEdges, fadeWidth]);

  return (
    <div
      data-slot="waveform"
      aria-hidden
      className={cn('relative', className)}
      ref={containerRef}
      style={{ ...style, height: heightStyle }}
      {...props}
    >
      <canvas className="block h-full w-full" ref={canvasRef} />
    </div>
  );
}
