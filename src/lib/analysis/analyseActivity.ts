import { haversineM, type LonLat } from './geo';
import { parseGpx, type TrackPoint } from './gpx';
import { SPIKE_LIMIT_KMH } from './settings';

export interface ActivitySummary {
  /** Accepted track points in file order, for drawing. */
  route: LonLat[];
  distanceM: number;
  /** Facts from the file used later to decide the activity type. */
  source: { typeLabel: string | null; creator: string | null; hasPower: boolean };
}

const lonLat = (p: TrackPoint): LonLat => [p.lon, p.lat];

/** True when moving from `a` to `b` is faster than `limitKmh`; untimed pairs can't be judged, so never. */
function tooFast(a: TrackPoint | undefined, b: TrackPoint | undefined, limitKmh: number): boolean {
  if (!a || !b || a.time === null || b.time === null || b.time <= a.time) return false;
  const kmh = haversineM(lonLat(a), lonLat(b)) / 1000 / ((b.time - a.time) / 3_600_000);
  return kmh > limitKmh;
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

/** The analysis seam: GPX text in, activity summary out. Pure; runs in the worker and in tests. */
export function analyseActivity(gpxText: string): ActivitySummary {
  const { segments, typeLabel, creator, hasPower } = parseGpx(gpxText);
  const route: LonLat[] = [];
  let distanceM = 0;
  for (const seg of segments) {
    seg.forEach((pt, i) => {
      if (isSpike(seg, i, SPIKE_LIMIT_KMH.running)) return;
      const prev = route.at(-1);
      // Consecutive accepted points, including across a segment gap, add their straight-line distance.
      if (prev) distanceM += haversineM(prev, lonLat(pt));
      route.push(lonLat(pt));
    });
  }
  if (route.length === 0) throw new Error('No track points found');
  return { route, distanceM, source: { typeLabel, creator, hasPower } };
}
