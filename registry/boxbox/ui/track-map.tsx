/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the map is a graphic built from SVG and markers, not an <img> */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DURATION } from '@/registry/boxbox/lib/motion';
import type { TrackMarker, TrackSector, TrackStatus } from '@/registry/boxbox/lib/types';
import { cn } from '@/lib/utils';

export type TrackMapSize = 'sm' | 'md' | 'lg';

/** Spoken form of each track status, for the map's accessible summary. */
export const TRACK_MAP_STATUS_LABELS: Record<TrackStatus, string> = {
  green: 'green',
  yellow: 'yellow',
  'double-yellow': 'double yellow',
  red: 'red',
  sc: 'safety car',
  vsc: 'virtual safety car',
  chequered: 'chequered',
};

/** Sector colours follow the Flag Banner: SC and VSC are yellow, like the real boards. */
const STATUS_STROKES: Record<TrackStatus, string> = {
  green: 'stroke-flag-green',
  yellow: 'stroke-flag-yellow',
  'double-yellow': 'stroke-flag-yellow',
  red: 'stroke-flag-red',
  sc: 'stroke-flag-yellow',
  vsc: 'stroke-flag-yellow',
  chequered: 'stroke-flag-chequered-a',
};

/** Marker geometry is in viewBox units, so it scales with the map and not with the page. */
const MARKER_SIZES: Record<TrackMapSize, { dot: number; emphasis: number; label: number }> = {
  sm: { dot: 16, emphasis: 22, label: 20 },
  md: { dot: 22, emphasis: 30, label: 26 },
  lg: { dot: 28, emphasis: 38, label: 34 },
};

export const TRACK_MAP_VIEW_BOX = '0 0 1000 600';
export const TRACK_MAP_STROKE_WIDTH = 14;

/** A lap wraps when progress falls from near the line back to just after it. */
const WRAP_FROM = 0.75;
const WRAP_TO = 0.25;

/**
 * Position samples arrive at a fixed rate, so a marker moves at constant speed
 * between them. Chained linear transitions that last one sample interval read as
 * continuous motion; any easing would make each car stop and start on every update.
 */
export const TRACK_MAP_TRANSITION_MS = DURATION.base * 1000;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** A path that ends with a closepath command loops, so `offset-distance` can exceed 100%. */
const isClosedPath = (d: string) => /z\s*$/i.test(d);
const round = (value: number) => Math.round(value * 100) / 100;
/** Fractions of a lap multiply into long floats; six places is past any pixel. */
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** `useLayoutEffect` warns when the tree is rendered on a server, so fall back there. */
const useMeasureEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function viewBoxSize(viewBox: string): { width: number; height: number } {
  const parts = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = parts[2];
  const height = parts[3];
  return {
    width: width === undefined || !Number.isFinite(width) || width <= 0 ? 1000 : width,
    height: height === undefined || !Number.isFinite(height) || height <= 0 ? 600 : height,
  };
}

export type FitPointsOptions = {
  width?: number;
  height?: number;
  padding?: number;
};

export type PathFromPointsOptions = FitPointsOptions & {
  close?: boolean;
};

/**
 * Fits arbitrary coordinates into a `viewBox`, keeping their aspect ratio, centring them,
 * and flipping the y axis so that north points up. Returns the fitted points in viewBox
 * units, so a second layer (a pit lane, a marker) can be derived in the same space.
 */
export function fitPoints(
  points: readonly (readonly [number, number])[],
  options: FitPointsOptions = {},
): { points: [number, number][]; viewBox: string } {
  const { width = 1000, height = 600, padding = 40 } = options;
  const viewBox = `0 0 ${width} ${height}`;
  if (points.length === 0) return { points: [], viewBox };

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  // A single point, or a perfectly straight line, has no span on one axis. That axis
  // cannot be scaled, so it is simply centred.
  const fitX = spanX === 0 ? Infinity : (width - padding * 2) / spanX;
  const fitY = spanY === 0 ? Infinity : (height - padding * 2) / spanY;
  const scale = Number.isFinite(Math.min(fitX, fitY)) ? Math.min(fitX, fitY) : 1;
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return {
    points: points.map(([x, y]) => [
      round(offsetX + (x - minX) * scale),
      // Flipped: source coordinates grow northwards, SVG grows downwards.
      round(height - (offsetY + (y - minY) * scale)),
    ]),
    viewBox,
  };
}

/** Joins points already in viewBox units into an SVG `d` of straight segments. */
export function pointsToPath(points: readonly (readonly [number, number])[], close = true): string {
  if (points.length === 0) return '';
  const d = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`)
    .join(' ');
  return close ? `${d} Z` : d;
}

/**
 * Turns arbitrary coordinates into an SVG `d` and a matching `viewBox`.
 *
 * Any source of points works, including a GeoJSON `LineString` of longitude and
 * latitude pairs. The outline keeps its aspect ratio, is centred inside the box,
 * and the y axis is flipped so that north points up.
 */
export function pathFromPoints(
  points: readonly (readonly [number, number])[],
  options: PathFromPointsOptions = {},
): { d: string; viewBox: string } {
  const { close = true, ...fit } = options;
  const fitted = fitPoints(points, fit);
  return { d: pointsToPath(fitted.points, close), viewBox: fitted.viewBox };
}

/**
 * Dash maths for one sector of a lap.
 *
 * The overlay path carries `pathLength={length}`, so `start` and `end` are read as
 * fractions of the lap. A sector whose `end` is before its `start` wraps across the
 * start/finish line, which the repeating dash pattern handles on its own.
 */
export function sectorDash(
  sector: TrackSector,
  length: number,
): { strokeDasharray: string; strokeDashoffset: number } {
  const start = clamp01(sector.start);
  const end = clamp01(sector.end);
  const span = end >= start ? end - start : 1 - start + end;
  const visible = round6(span * length);
  return {
    strokeDasharray: `${visible} ${round6(length - visible)}`,
    // A negative offset moves the pattern forward, so the dash begins at `start`.
    strokeDashoffset: start === 0 ? 0 : round6(-start * length),
  };
}

/** The lap summary a screen reader hears: how many cars, and any sector under a flag. */
export function trackMapLabel(sectors: readonly TrackSector[], markers: readonly TrackMarker[]) {
  const cars = markers.length === 1 ? '1 car' : `${markers.length} cars`;
  const flagged = sectors
    .map((sector, index) =>
      sector.status ? `sector ${index + 1} ${TRACK_MAP_STATUS_LABELS[sector.status]}` : null,
    )
    .filter((part) => part !== null);
  return ['Track map', cars, ...flagged].join(', ');
}

export function TrackMapPath({
  path,
  strokeWidth = TRACK_MAP_STROKE_WIDTH,
  className,
  ...props
}: { path: string; strokeWidth?: number } & React.ComponentProps<'path'>) {
  return (
    <path
      data-slot="track-map-path"
      d={path}
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={cn('stroke-muted-foreground opacity-30', className)}
      {...props}
    />
  );
}

/** The pit lane: a thinner, fainter road beside the track, drawn underneath it. */
export function TrackMapPitLane({
  path,
  strokeWidth = TRACK_MAP_STROKE_WIDTH,
  className,
  ...props
}: { path: string; strokeWidth?: number } & React.ComponentProps<'path'>) {
  return (
    <path
      data-slot="track-map-pit-lane"
      d={path}
      fill="none"
      strokeWidth={strokeWidth * 0.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={cn('stroke-muted-foreground opacity-20', className)}
      {...props}
    />
  );
}

export function TrackMapSectors({
  path,
  sectors,
  strokeWidth = TRACK_MAP_STROKE_WIDTH,
  className,
  ...props
}: {
  path: string;
  sectors: readonly TrackSector[];
  strokeWidth?: number;
} & React.ComponentProps<'g'>) {
  return (
    <g data-slot="track-map-sectors" {...props}>
      {sectors.map((sector, index) => {
        if (!sector.status) return null;
        const dash = sectorDash(sector, 1);
        return (
          <path
            // Sectors are a fixed, ordered cut of the lap; the index is their identity.
            // oxlint-disable-next-line no-array-index-key
            key={index}
            data-slot="track-map-sector"
            data-status={sector.status}
            d={path}
            fill="none"
            pathLength={1}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="butt"
            strokeDasharray={dash.strokeDasharray}
            strokeDashoffset={dash.strokeDashoffset}
            className={cn('transition-colors', STATUS_STROKES[sector.status], className)}
          />
        );
      })}
    </g>
  );
}

export function TrackMapStartFinish({
  path,
  strokeWidth = TRACK_MAP_STROKE_WIDTH,
  className,
  ...props
}: { path: string; strokeWidth?: number } & React.ComponentProps<'path'>) {
  return (
    <path
      data-slot="track-map-start-finish"
      d={path}
      fill="none"
      pathLength={1}
      strokeWidth={strokeWidth * 1.8}
      strokeLinecap="butt"
      // A very short dash at progress 0 reads as a tick across the track, and needs
      // no path measurement, so it is identical on the server and in the browser.
      strokeDasharray="0.005 0.995"
      strokeDashoffset={0}
      className={cn('stroke-foreground', className)}
      {...props}
    />
  );
}

/**
 * One car. `path` is the road the marker runs on: the lap, or the pit lane while the car is
 * in it. A marker that changes road must be remounted (the map keys it on the road), so it
 * appears at its new place rather than sliding there across the circuit.
 */
export function TrackMapMarker({
  marker,
  path,
  size = 'md',
  transitionMs = TRACK_MAP_TRANSITION_MS,
  dimmed = false,
  onSelect,
  className,
  ...props
}: {
  marker: TrackMarker;
  path: string;
  size?: TrackMapSize;
  transitionMs?: number;
  /** Faded because another car is emphasised. */
  dimmed?: boolean;
  /** Makes the dot a button. Without it the marker is not operable at all. */
  onSelect?: () => void;
} & React.ComponentProps<'div'>) {
  const progress = clamp01(marker.progress);
  // Adjusting state during render: a lap that wraps must not run the marker backwards.
  // On a closed path `offset-distance` wraps modulo the lap, so the marker keeps a lap
  // count and is sent to `laps + progress`: it crosses the line without a jump. An open
  // path has nowhere to continue, so its transition is dropped for the wrapping frame.
  const closed = isClosedPath(path);
  const [previous, setPrevious] = useState(progress);
  const [laps, setLaps] = useState(0);
  const [wrapped, setWrapped] = useState(false);
  if (previous !== progress) {
    const wrap = previous > WRAP_FROM && progress < WRAP_TO;
    setPrevious(progress);
    setLaps(wrap && closed ? laps + 1 : laps);
    setWrapped(wrap && !closed);
  }
  const distance = closed ? laps + progress : progress;

  const sizes = MARKER_SIZES[size];
  const dot = marker.emphasis ? sizes.emphasis : sizes.dot;
  // A label next to every dot is unreadable on a small map, so only the cars that
  // matter keep theirs there.
  const showLabel = marker.code !== undefined && (marker.emphasis === true || size !== 'sm');

  const body = (
    <>
      <span
        data-slot="track-map-marker-dot"
        className="absolute rounded-full ring-2 ring-background group-focus-visible/marker:ring-4 group-focus-visible/marker:ring-ring"
        style={{
          width: dot,
          height: dot,
          marginLeft: -dot / 2,
          marginTop: -dot / 2,
          backgroundColor: marker.color,
        }}
      />
      {showLabel && (
        <span
          data-slot="track-map-marker-code"
          className="absolute font-display font-bold uppercase leading-none text-foreground"
          style={{
            left: dot * 0.8,
            top: -sizes.label / 2,
            fontSize: sizes.label,
            letterSpacing: '0.08em',
          }}
        >
          {marker.code}
        </span>
      )}
    </>
  );

  return (
    <div
      data-slot="track-map-marker"
      data-id={marker.id}
      data-pit={marker.inPit ? 'true' : undefined}
      data-wrap={wrapped ? 'true' : undefined}
      data-dimmed={dimmed ? 'true' : undefined}
      // A clickable marker has to stay in the accessibility tree; a decorative one does not.
      aria-hidden={onSelect === undefined ? true : undefined}
      className={cn(
        'absolute left-0 top-0 size-0 transition-[offset-distance,opacity]',
        'motion-reduce:transition-none data-[wrap]:transition-none',
        dimmed && 'opacity-40',
        className,
      )}
      style={{
        offsetPath: `path("${path}")`,
        offsetDistance: `${round(distance * 100)}%`,
        offsetRotate: '0deg',
        transitionDuration: `${Math.max(0, transitionMs)}ms`,
        transitionTimingFunction: 'linear',
      }}
      {...props}
    >
      {onSelect ? (
        // Zero-sized, like its parent: the dot overflows it and is what gets clicked, so the
        // button never covers any of the track around the car.
        <button
          type="button"
          data-slot="track-map-marker-button"
          aria-label={marker.code ?? marker.id}
          aria-pressed={marker.emphasis === true}
          onClick={onSelect}
          className="pointer-events-auto group/marker absolute size-0 cursor-pointer appearance-none border-0 bg-transparent p-0 focus-visible:outline-hidden"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
}

export type TrackMapProps = {
  /** SVG `d` for the lap, in the coordinate space of `viewBox`. */
  path: string;
  /**
   * SVG `d` for the pit lane, an open path from pit entry to pit exit in the same space.
   * A marker with `inPit` runs along it, its `progress` measured from entry to exit.
   */
  pitLane?: string;
  viewBox?: string;
  sectors?: readonly TrackSector[];
  markers?: readonly TrackMarker[];
  /** A tick across the track at progress 0. */
  showStartFinish?: boolean;
  /** Track width in viewBox units. */
  strokeWidth?: number;
  /** Drives marker and label size only; the map always fills its container. */
  size?: TrackMapSize;
  /**
   * How long a marker takes to slide to a new `progress`. Set it to the interval
   * between your position updates so cars move at constant speed between samples.
   */
  transitionMs?: number;
  /**
   * Makes every marker a button. The map then exposes its children rather than reading as one
   * graphic, so its `role` becomes `group`.
   */
  onMarkerClick?: (marker: TrackMarker) => void;
  /** Fades every marker without `emphasis`, so the emphasised car is the one the eye follows. */
  dimOthers?: boolean;
} & React.ComponentProps<'div'>;

export function TrackMap({
  path,
  pitLane,
  viewBox = TRACK_MAP_VIEW_BOX,
  sectors = [],
  markers = [],
  showStartFinish = true,
  strokeWidth = TRACK_MAP_STROKE_WIDTH,
  size = 'md',
  transitionMs = TRACK_MAP_TRANSITION_MS,
  onMarkerClick,
  dimOthers = false,
  className,
  ...props
}: TrackMapProps) {
  const { width, height } = viewBoxSize(viewBox);
  const root = useRef<HTMLDivElement>(null);
  // `offset-path: path()` on an HTML element is measured in CSS pixels of its
  // containing block, so the marker layer is kept at exactly the viewBox size and
  // scaled down to whatever width the map was given. One is right until measured.
  const [scale, setScale] = useState(1);

  useMeasureEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setScale(element.clientWidth / width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={root}
      data-slot="track-map"
      data-size={size}
      // `img` hides its subtree, which would hide the marker buttons with it.
      role={onMarkerClick ? 'group' : 'img'}
      aria-label={trackMapLabel(sectors, markers)}
      className={cn('relative w-full', className)}
      style={{ ['--track-map-scale' as string]: scale }}
      {...props}
    >
      <svg
        aria-hidden
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
      >
        {pitLane && <TrackMapPitLane path={pitLane} strokeWidth={strokeWidth} />}
        <TrackMapPath path={path} strokeWidth={strokeWidth} />
        <TrackMapSectors path={path} sectors={sectors} strokeWidth={strokeWidth} />
        {showStartFinish && <TrackMapStartFinish path={path} strokeWidth={strokeWidth} />}
      </svg>
      {markers.length > 0 && (
        <div
          data-slot="track-map-markers"
          // The layer covers the whole map, so it never takes a pointer; the markers in it do.
          aria-hidden={onMarkerClick === undefined ? true : undefined}
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width, height, transform: 'scale(var(--track-map-scale))' }}
        >
          {markers.map((marker) => {
            const inPit = marker.inPit === true && pitLane !== undefined;
            return (
              <TrackMapMarker
                // Keyed on the road too: a car entering or leaving the pit lane gets a
                // fresh marker at its new place, with no transition across the circuit.
                key={`${marker.id}:${inPit ? 'pit' : 'lap'}`}
                marker={marker}
                path={inPit ? pitLane : path}
                size={size}
                transitionMs={transitionMs}
                dimmed={dimOthers && marker.emphasis !== true}
                onSelect={onMarkerClick === undefined ? undefined : () => onMarkerClick(marker)}
              />
            );
          })}
        </div>
      )}
      {markers.length > 0 && (
        <ul data-slot="track-map-positions" className="sr-only">
          {markers.map((marker) => (
            <li key={marker.id}>
              {marker.code ?? marker.id}{' '}
              {marker.inPit
                ? 'in the pit lane'
                : `at ${Math.round(clamp01(marker.progress) * 100)}% of the lap`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
