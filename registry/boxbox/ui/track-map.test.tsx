import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrackMarker, TrackSector } from '@/registry/boxbox/lib/types';
import {
  TrackMap,
  pathFromPoints,
  sectorDash,
  trackMapLabel,
} from '@/registry/boxbox/ui/track-map';

const PATH = 'M 0 0 L 100 0 L 100 100 Z';

const marker = (marker: Partial<TrackMarker> = {}): TrackMarker => ({
  id: 'evo',
  progress: 0.25,
  color: '#C78B46',
  ...marker,
});

describe('pathFromPoints', () => {
  it('fits the points inside the viewBox and closes the loop', () => {
    const { d, viewBox } = pathFromPoints(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      { width: 200, height: 200, padding: 20 },
    );
    expect(viewBox).toBe('0 0 200 200');
    expect(d).toBe('M 20 180 L 180 180 L 180 20 L 20 20 Z');
  });

  it('flips the y axis so north is up', () => {
    // The northernmost point has the largest source y and the smallest SVG y.
    const { d } = pathFromPoints(
      [
        [0, 0],
        [0, 1],
      ],
      { width: 100, height: 100, padding: 10, close: false },
    );
    expect(d).toBe('M 50 90 L 50 10');
  });

  it('keeps the aspect ratio of a wide outline and centres it', () => {
    const { d } = pathFromPoints(
      [
        [0, 0],
        [100, 0],
        [100, 50],
      ],
      { width: 1000, height: 600, padding: 100, close: false },
    );
    // 800 / 100 and 400 / 50 are the same scale, so the outline fills the padded box.
    expect(d).toBe('M 100 500 L 900 500 L 900 100');
  });

  it('defaults to a 1000 by 600 box and survives an empty list', () => {
    expect(pathFromPoints([])).toEqual({ d: '', viewBox: '0 0 1000 600' });
  });

  it('does not divide by zero when every point shares a coordinate', () => {
    const { d } = pathFromPoints(
      [
        [5, 5],
        [5, 5],
      ],
      { width: 100, height: 100, close: false },
    );
    expect(d).toBe('M 50 50 L 50 50');
  });
});

describe('sectorDash', () => {
  it('draws the span and hides the rest of the lap', () => {
    expect(sectorDash({ start: 0, end: 0.33 }, 1)).toEqual({
      strokeDasharray: '0.33 0.67',
      strokeDashoffset: 0,
    });
  });

  it('offsets a sector that starts mid lap', () => {
    expect(sectorDash({ start: 0.33, end: 0.66 }, 1)).toEqual({
      strokeDasharray: '0.33 0.67',
      strokeDashoffset: -0.33,
    });
  });

  it('scales to any path length', () => {
    expect(sectorDash({ start: 0.5, end: 1 }, 400)).toEqual({
      strokeDasharray: '200 200',
      strokeDashoffset: -200,
    });
  });

  it('wraps a sector that crosses the start line', () => {
    expect(sectorDash({ start: 0.9, end: 0.1 }, 1)).toEqual({
      strokeDasharray: '0.2 0.8',
      strokeDashoffset: -0.9,
    });
  });

  it('clamps progress outside the lap', () => {
    expect(sectorDash({ start: -1, end: 2 }, 1)).toEqual({
      strokeDasharray: '1 0',
      strokeDashoffset: 0,
    });
  });
});

describe('trackMapLabel', () => {
  it('summarises the cars and the flagged sectors', () => {
    expect(
      trackMapLabel(
        [
          { start: 0, end: 0.5 },
          { start: 0.5, end: 1, status: 'yellow' },
        ],
        [marker(), marker({ id: 'mso' })],
      ),
    ).toBe('Track map, 2 cars, sector 2 yellow');
  });

  it('says safety car rather than the code, and counts one car', () => {
    expect(trackMapLabel([{ start: 0, end: 1, status: 'sc' }], [marker()])).toBe(
      'Track map, 1 car, sector 1 safety car',
    );
  });
});

describe('TrackMap', () => {
  it('renders the base path and names itself', () => {
    const { container } = render(<TrackMap path={PATH} />);
    const root = container.querySelector('[data-slot="track-map"]');
    expect(root).toHaveAttribute('data-size', 'md');
    expect(screen.getByRole('img')).toHaveAccessibleName('Track map, 0 cars');
    const base = container.querySelector('[data-slot="track-map-path"]');
    expect(base).toHaveAttribute('d', PATH);
    expect(base).toHaveAttribute('fill', 'none');
  });

  it('overlays one path per sector that carries a status', () => {
    const sectors: TrackSector[] = [
      { start: 0, end: 0.33, status: 'green' },
      { start: 0.33, end: 0.66 },
      { start: 0.66, end: 1, status: 'red' },
    ];
    const { container } = render(<TrackMap path={PATH} sectors={sectors} />);
    const overlays = container.querySelectorAll('[data-slot="track-map-sector"]');
    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toHaveAttribute('data-status', 'green');
    expect(overlays[0]).toHaveAttribute('pathLength', '1');
    expect(overlays[0]).toHaveAttribute('stroke-dashoffset', '0');
    expect(overlays[1]).toHaveAttribute('data-status', 'red');
    expect(overlays[1]).toHaveAttribute('stroke-dashoffset', '-0.66');
  });

  it('places a marker per car with its progress as an offset distance', () => {
    const { container } = render(
      <TrackMap
        path={PATH}
        markers={[marker({ id: 'evo', progress: 0.25 }), marker({ id: 'mso', progress: 0.5 })]}
      />,
    );
    const markers = container.querySelectorAll('[data-slot="track-map-marker"]');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute('data-id', 'evo');
    expect(markers[0]).toHaveStyle({ offsetDistance: '25%', offsetRotate: '0deg' });
    expect(markers[0]).toHaveStyle({ offsetPath: `path("${PATH}")` });
    expect(markers[1]).toHaveAttribute('data-id', 'mso');
    expect(markers[1]).toHaveStyle({ offsetDistance: '50%' });
  });

  it('shows the code beside a marker and makes an emphasised one bigger', () => {
    const { container } = render(
      <TrackMap
        path={PATH}
        markers={[
          marker({ id: 'evo', code: 'EVO', emphasis: true }),
          marker({ id: 'mso', code: 'MSO' }),
        ]}
      />,
    );
    const codes = container.querySelectorAll('[data-slot="track-map-marker-code"]');
    expect(codes).toHaveLength(2);
    expect(codes[0]).toHaveTextContent('EVO');
    const dots = container.querySelectorAll('[data-slot="track-map-marker-dot"]');
    expect(dots[0]).toHaveStyle({ width: '30px', backgroundColor: '#C78B46' });
    expect(dots[1]).toHaveStyle({ width: '22px' });
  });

  it('keeps the label of an emphasised marker on a small map and drops the others', () => {
    const { container } = render(
      <TrackMap
        path={PATH}
        size="sm"
        markers={[
          marker({ id: 'evo', code: 'EVO', emphasis: true }),
          marker({ id: 'mso', code: 'MSO' }),
        ]}
      />,
    );
    const codes = container.querySelectorAll('[data-slot="track-map-marker-code"]');
    expect(codes).toHaveLength(1);
    expect(codes[0]).toHaveTextContent('EVO');
  });

  it('lists every marker and its lap progress for a screen reader', () => {
    const { container } = render(
      <TrackMap
        path={PATH}
        markers={[marker({ id: 'evo', code: 'EVO', progress: 0.25 }), marker({ id: 'mso' })]}
      />,
    );
    const list = container.querySelector('[data-slot="track-map-positions"]');
    expect(list).toHaveClass('sr-only');
    expect(list?.querySelectorAll('li')).toHaveLength(2);
    expect(list).toHaveTextContent('EVO at 25% of the lap');
    expect(list).toHaveTextContent('mso at 25% of the lap');
  });

  it('carries the marker past 100% when a lap wraps on a closed path', () => {
    const { container, rerender } = render(
      <TrackMap path={PATH} markers={[marker({ id: 'evo', progress: 0.98 })]} />,
    );
    const element = () => container.querySelector<HTMLElement>('[data-slot="track-map-marker"]');
    expect(element()?.style.offsetDistance).toBe('98%');

    rerender(<TrackMap path={PATH} markers={[marker({ id: 'evo', progress: 0.02 })]} />);
    expect(element()?.style.offsetDistance).toBe('102%');
    expect(element()).not.toHaveAttribute('data-wrap');

    rerender(<TrackMap path={PATH} markers={[marker({ id: 'evo', progress: 0.5 })]} />);
    expect(element()?.style.offsetDistance).toBe('150%');
  });

  it('drops the marker transition on the frame a lap wraps on an open path', () => {
    const open = 'M 0 0 L 100 0 L 100 100';
    const { container, rerender } = render(
      <TrackMap path={open} markers={[marker({ id: 'evo', progress: 0.98 })]} />,
    );
    const element = () => container.querySelector<HTMLElement>('[data-slot="track-map-marker"]');
    expect(element()).not.toHaveAttribute('data-wrap');

    rerender(<TrackMap path={open} markers={[marker({ id: 'evo', progress: 0.02 })]} />);
    expect(element()).toHaveAttribute('data-wrap', 'true');
    expect(element()?.style.offsetDistance).toBe('2%');

    rerender(<TrackMap path={open} markers={[marker({ id: 'evo', progress: 0.06 })]} />);
    expect(element()).not.toHaveAttribute('data-wrap');
  });

  it('slides markers linearly for the given sample interval', () => {
    const { container } = render(<TrackMap path={PATH} markers={[marker()]} transitionMs={240} />);
    expect(container.querySelector('[data-slot="track-map-marker"]')).toHaveStyle({
      transitionDuration: '240ms',
      transitionTimingFunction: 'linear',
    });
  });

  it('toggles the start finish tick', () => {
    const { container, rerender } = render(<TrackMap path={PATH} />);
    expect(container.querySelector('[data-slot="track-map-start-finish"]')).toBeInTheDocument();
    rerender(<TrackMap path={PATH} showStartFinish={false} />);
    expect(container.querySelector('[data-slot="track-map-start-finish"]')).toBeNull();
  });

  it('takes the marker layer size from the viewBox', () => {
    const { container } = render(
      <TrackMap path={PATH} viewBox="0 0 400 200" markers={[marker()]} />,
    );
    expect(container.querySelector('[data-slot="track-map-markers"]')).toHaveStyle({
      width: '400px',
      height: '200px',
    });
  });
});
