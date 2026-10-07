import tzLookup from 'tz-lookup';
import { typeFromLabel, type ActivityType, type TypeSource } from './activityType';
import { haversineM, type LonLat } from './geo';
import { AnalysisError } from './errors';
import { parseGpx, type TrackPoint } from './gpx';
import { matchPostcodes, type PostcodeIndex, type PostcodeResult } from './postcodes';
import {
  CYCLING_SPEED_KMH,
  ELEVATION_HYSTERESIS_M,
  MIN_COVERAGE,
  MOVING_SPEED_KMH,
  MOVING_WINDOW_S,
  SPIKE_LIMIT_KMH,
  UNCERTAIN_SPEED_KMH,
} from './settings';

export interface ActivitySummary {
  activityType: ActivityType;
  typeSource: TypeSource;
  /** The type was guessed from an average speed in the band where runs and rides overlap. */
  typeUncertain: boolean;
  /** Accepted track points in file order, for drawing. */
  route: LonLat[];
  distanceM: number;
  /** At least MIN_COVERAGE of points have timestamps; otherwise time-based figures are null. */
  timed: boolean;
  /** Epoch ms of the first timed point; null when untimed. */
  startTime: number | null;
  /** IANA timezone at the start point (e.g. Australia/Perth), for showing the start as local time. */
  timeZone: string | null;
  elapsedS: number | null;
  movingS: number | null;
  /** Null when under MIN_COVERAGE of points have elevation. */
  elevationGainM: number | null;
  /** Postcodes along the route; null when no postcode index was supplied. */
  postcodes: PostcodeResult | null;
  /** Facts from the file used later to decide the activity type. */
  source: { typeLabel: string | null; creator: string | null; hasPower: boolean };
}

type TimedPoint = TrackPoint & { time: number };

const lonLat = (p: TrackPoint): LonLat => [p.lon, p.lat];
const hasTime = (p: TrackPoint): p is TimedPoint => p.time !== null;
const kmh = (metres: number, ms: number) => metres / 1000 / (ms / 3_600_000);

/** True when moving from `a` to `b` is faster than `limitKmh`; untimed pairs can't be judged, so never. */
function tooFast(a: TrackPoint | undefined, b: TrackPoint | undefined, limitKmh: number): boolean {
  if (!a || !b || a.time === null || b.time === null || b.time <= a.time) return false;
  return kmh(haversineM(lonLat(a), lonLat(b)), b.time - a.time) > limitKmh;
}

/**
 * A spike is a point that is impossible to reach *and* to leave, judged against its raw neighbours in the
 * segment (not the last accepted point, so one bad fix can't make the real track look like spikes).
 * At a segment's ends, a point counts if its only move is impossible while the next move along is normal.
 */
function isSpike(seg: TrackPoint[], i: number, limitKmh: number): boolean {
  const [before, prev, pt, next, after] = [seg[i - 2], seg[i - 1], seg[i], seg[i + 1], seg[i + 2]];
  if (prev && next) return tooFast(prev, pt, limitKmh) && tooFast(pt, next, limitKmh);
  if (next) return tooFast(pt, next, limitKmh) && !!after && !tooFast(next, after, limitKmh);
  if (prev) return tooFast(prev, pt, limitKmh) && !!before && !tooFast(before, prev, limitKmh);
  return false;
}

/**
 * Seconds spent moving within one segment: each step counts when the net displacement from the point
 * MOVING_WINDOW_S earlier is at least MOVING_SPEED_KMH. Net displacement (not path length) is what keeps
 * GPS wobble while standing still from counting as movement. The window never reaches back across a
 * pause (a step of MOVING_WINDOW_S or more), or the first seconds after resuming would look stationary.
 */
function movingSeconds(seg: TimedPoint[]): number {
  const windowMs = MOVING_WINDOW_S * 1000;
  let total = 0;
  let w = 0;
  for (let i = 1; i < seg.length; i++) {
    const a = seg[i - 1]!;
    const b = seg[i]!;
    if (b.time <= a.time) continue;
    if (b.time - a.time >= windowMs) {
      w = i - 1; // the pause step is judged on its own; later windows start after it
    } else {
      while (w + 1 < i && b.time - seg[w + 1]!.time >= windowMs) w++;
    }
    const from = seg[w]!;
    if (kmh(haversineM(lonLat(from), lonLat(b)), b.time - from.time) >= MOVING_SPEED_KMH) {
      total += (b.time - a.time) / 1000;
    }
    if (b.time - a.time >= windowMs) w = i;
  }
  return total;
}

/**
 * Total climb with a dead band of ELEVATION_HYSTERESIS_M: a climb starts once elevation rises more than the
 * band above the lowest point so far, follows the highest point while climbing, and ends (adding its height)
 * once elevation falls more than the band below that high. A climb still open at the end is added too.
 */
function elevationGain(elevations: number[]): number {
  let gain = 0;
  let low = elevations[0] ?? 0;
  let high = low;
  let climbing = false;
  for (const ele of elevations) {
    if (climbing) {
      high = Math.max(high, ele);
      if (ele < high - ELEVATION_HYSTERESIS_M) {
        gain += high - low;
        climbing = false;
        low = ele;
      }
    } else {
      low = Math.min(low, ele);
      if (ele > low + ELEVATION_HYSTERESIS_M) {
        climbing = true;
        high = ele;
      }
    }
  }
  return climbing ? gain + high - low : gain;
}

type Metrics = Omit<
  ActivitySummary,
  'activityType' | 'typeSource' | 'typeUncertain' | 'source' | 'postcodes'
>;

/** Everything except the type, for one spike limit (which depends on the type). */
/** Metrics plus the accepted points per segment, which postcode matching needs (gaps are not travelled). */
type Measured = Metrics & { segments: LonLat[][] };

function measure(segments: TrackPoint[][], spikeLimitKmh: number): Measured {
  const accepted = segments.map((seg) => seg.filter((_, i) => !isSpike(seg, i, spikeLimitKmh)));
  const points = accepted.flat();
  if (points.length === 0) throw new AnalysisError('no-points', 'No track points found');

  // Consecutive accepted points, including across a segment gap, add their straight-line distance.
  const route = points.map(lonLat);
  let distanceM = 0;
  for (let i = 1; i < route.length; i++) distanceM += haversineM(route[i - 1]!, route[i]!);

  const timedPoints = points.filter(hasTime);
  const timed = timedPoints.length >= MIN_COVERAGE * points.length;
  const first = timedPoints[0];
  const last = timedPoints.at(-1);
  const elapsedS = timed && first && last ? (last.time - first.time) / 1000 : null;
  // Gaps between segments are never moving: each segment is measured on its own.
  const movingS = timed ? accepted.reduce((sum, seg) => sum + movingSeconds(seg.filter(hasTime)), 0) : null;

  const elevations = points.flatMap((p) => (p.ele === null ? [] : [p.ele]));
  const elevationGainM =
    elevations.length >= MIN_COVERAGE * points.length ? Math.round(elevationGain(elevations)) : null;

  const start = timed ? first : undefined;
  return {
    route,
    distanceM,
    timed,
    startTime: start?.time ?? null,
    timeZone: start ? tzLookup(start.lat, start.lon) : null,
    elapsedS,
    movingS,
    elevationGainM,
    segments: accepted.map((seg) => seg.map(lonLat)),
  };
}

const averageKmh = (m: Measured) => (m.movingS ? kmh(m.distanceM, m.movingS * 1000) : null);

/**
 * The analysis seam: GPX text in, activity summary out. Pure; runs in the worker and in tests.
 * `activityType` overrides detection (the user's Run/Ride toggle).
 */
export function analyseActivity(
  gpxText: string,
  options: { activityType?: ActivityType; postcodes?: PostcodeIndex } = {},
): ActivitySummary {
  const { segments, typeLabel, creator, hasPower } = parseGpx(gpxText);
  const source = { typeLabel, creator, hasPower };
  const withPostcodes = ({ segments: accepted, ...m }: Measured) => ({
    ...m,
    postcodes: options.postcodes ? matchPostcodes(accepted, options.postcodes) : null,
  });

  // Known type: from the user, the file's <type>, or power data (only bikes record power).
  const fromFile = typeFromLabel(typeLabel);
  const known: [ActivityType, TypeSource] | null = options.activityType
    ? [options.activityType, 'user']
    : fromFile
      ? [fromFile, 'file']
      : hasPower
        ? ['cycling', 'power']
        : null;
  if (known) {
    const [activityType, typeSource] = known;
    const metrics = measure(segments, SPIKE_LIMIT_KMH[activityType]);
    return { activityType, typeSource, typeUncertain: false, ...withPostcodes(metrics), source };
  }

  // Unknown type: measure with the stricter running spike limit, then guess from average moving speed.
  const asRun = measure(segments, SPIKE_LIMIT_KMH.running);
  const speed = averageKmh(asRun);
  if (speed === null)
    return {
      activityType: 'running',
      typeSource: 'default',
      typeUncertain: false,
      ...withPostcodes(asRun),
      source,
    };
  const activityType: ActivityType = speed >= CYCLING_SPEED_KMH ? 'cycling' : 'running';
  const typeUncertain = speed >= UNCERTAIN_SPEED_KMH.min && speed <= UNCERTAIN_SPEED_KMH.max;
  const metrics = activityType === 'cycling' ? measure(segments, SPIKE_LIMIT_KMH.cycling) : asRun;
  return { activityType, typeSource: 'speed', typeUncertain, ...withPostcodes(metrics), source };
}
