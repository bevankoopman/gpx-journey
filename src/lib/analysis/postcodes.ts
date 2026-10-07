import Flatbush from 'flatbush';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { haversineM, type LonLat } from './geo';
import { POSTCODE_MIN_M, POSTCODE_SPARSE_STEP_M } from './settings';

interface PostcodeShape {
  code: string;
  localities: string[];
  /** Every ring (outer and holes, all parts) as flat [lon, lat, lon, lat, …]; even-odd fill. */
  rings: Float64Array[];
  feature: Feature<Polygon | MultiPolygon, { code: string }>;
}

export interface PostcodeIndex {
  shapes: PostcodeShape[];
  /** Spatial index over each shape's bounding box. */
  tree: Flatbush;
  /** Bounding box of all postcodes [minLon, minLat, maxLon, maxLat]: "does this route overlap Australia?" */
  bounds: [number, number, number, number];
}

export interface PostcodePassed {
  code: string;
  localities: string[];
  /** Route distance inside this postcode, summed over every visit. */
  distanceM: number;
}

export interface PostcodeResult {
  /** The route's bounding box overlaps the postcode data at all. */
  overlapsAustralia: boolean;
  /** Postcodes passed through, in order of first entry. */
  passed: PostcodePassed[];
  /** Route distance inside no postcode (water, beyond the coast). */
  outsideM: number;
  /** Boundaries of the passed postcodes, for shading on the map. */
  shapes: FeatureCollection<Polygon | MultiPolygon, { code: string }>;
}

const ringsOf = (geometry: Polygon | MultiPolygon): Position[][] =>
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();

export function buildPostcodeIndex(
  boundaries: FeatureCollection<Polygon | MultiPolygon, { code: string }>,
  localities: Record<string, string[]>,
): PostcodeIndex {
  const shapes = boundaries.features.map((feature) => ({
    code: feature.properties.code,
    localities: localities[feature.properties.code] ?? [],
    rings: ringsOf(feature.geometry).map((ring) => Float64Array.from(ring.flatMap(([x, y]) => [x!, y!]))),
    feature,
  }));
  const tree = new Flatbush(Math.max(1, shapes.length));
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { rings } of shapes) {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) {
      for (let i = 0; i < r.length; i += 2) {
        minX = Math.min(minX, r[i]!);
        maxX = Math.max(maxX, r[i]!);
        minY = Math.min(minY, r[i + 1]!);
        maxY = Math.max(maxY, r[i + 1]!);
      }
    }
    tree.add(minX, minY, maxX, maxY);
    bounds[0] = Math.min(bounds[0], minX);
    bounds[1] = Math.min(bounds[1], minY);
    bounds[2] = Math.max(bounds[2], maxX);
    bounds[3] = Math.max(bounds[3], maxY);
  }
  if (shapes.length === 0) tree.add(0, 0, 0, 0);
  tree.finish();
  return { shapes, tree, bounds };
}

/** Even-odd ray casting over all rings, so holes and multi-part postcodes work. */
function contains(shape: PostcodeShape, [x, y]: LonLat): boolean {
  let inside = false;
  for (const r of shape.rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function postcodeAt(index: PostcodeIndex, p: LonLat): PostcodeShape | null {
  for (const i of index.tree.search(p[0], p[1], p[0], p[1])) {
    const shape = index.shapes[i]!;
    if (contains(shape, p)) return shape;
  }
  return null;
}

/** Fractions t ∈ (0, 1) along a→b where it crosses an edge of `shape`. */
function crossings(shape: PostcodeShape, a: LonLat, b: LonLat): number[] {
  const ts: number[] = [];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  for (const r of shape.rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const [x1, y1, x2, y2] = [r[j]!, r[j + 1]!, r[i]!, r[i + 1]!];
      const [ex, ey] = [x2 - x1, y2 - y1];
      const denom = dx * ey - dy * ex;
      if (denom === 0) continue; // parallel
      const t = ((x1 - a[0]) * ey - (y1 - a[1]) * ex) / denom;
      const u = ((x1 - a[0]) * dy - (y1 - a[1]) * dx) / denom;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  }
  return ts;
}

function overlaps(route: LonLat[], [minX, minY, maxX, maxY]: PostcodeIndex['bounds']): boolean {
  // A loop, not Math.min(...xs): long routes exceed the engine's argument limit.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of route) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return x0 <= maxX && x1 >= minX && y0 <= maxY && y1 >= minY;
}

/**
 * Which postcodes a recorded route passes through, and how far inside each. Only steps within a segment
 * count: the unrecorded gap between segments is neither in a postcode nor outside one. Each point is labelled
 * by point-in-polygon; a short step whose ends share a label lies in that postcode, otherwise the step is cut
 * at every boundary crossing and each piece attributed by its midpoint, so clips between sparse points count.
 */
export function matchPostcodes(segments: LonLat[][], index: PostcodeIndex): PostcodeResult {
  const distance = new Map<PostcodeShape, number>();
  let outsideM = 0;
  const add = (shape: PostcodeShape | null, m: number) => {
    if (m <= 0) return;
    if (shape) distance.set(shape, (distance.get(shape) ?? 0) + m);
    else outsideM += m;
  };

  /** Cut a→b at every boundary it crosses and attribute each piece by its midpoint. */
  const clipStep = (a: LonLat, b: LonLat, length: number) => {
    const candidates = index.tree
      .search(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]))
      .map((k) => index.shapes[k]!);
    const cuts = [0, ...candidates.flatMap((s) => crossings(s, a, b)), 1].sort((x, y) => x - y);
    for (let k = 1; k < cuts.length; k++) {
      const [t0, t1] = [cuts[k - 1]!, cuts[k]!];
      if (t1 <= t0) continue;
      const tm = (t0 + t1) / 2;
      const mid: LonLat = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm];
      add(candidates.find((s) => contains(s, mid)) ?? null, (t1 - t0) * length);
    }
  };

  const labels = segments.map((seg) => seg.map((p) => postcodeAt(index, p)));
  segments.forEach((seg, si) => {
    for (let i = 1; i < seg.length; i++) {
      const [a, b] = [seg[i - 1]!, seg[i]!];
      const [la, lb] = [labels[si]![i - 1]!, labels[si]![i]!];
      const length = haversineM(a, b);
      // Dense steps can't hide a meaningful piece of another postcode; sparse ones can, so check them.
      if (la && la === lb && length <= POSTCODE_SPARSE_STEP_M) add(la, length);
      else clipStep(a, b, length);
    }
  });

  // Map order is first entry. Only postcodes with POSTCODE_MIN_M inside count; if none does, the start one does.
  let counted = [...distance].filter(([, m]) => m >= POSTCODE_MIN_M);
  const start = labels[0]?.[0] ?? [...distance.keys()][0];
  if (counted.length === 0 && start) counted = [[start, distance.get(start) ?? 0]];
  const passed = counted.map(([shape, distanceM]) => ({
    code: shape.code,
    localities: shape.localities,
    distanceM,
  }));

  return {
    overlapsAustralia: overlaps(segments.flat(), index.bounds),
    passed,
    outsideM,
    shapes: { type: 'FeatureCollection', features: counted.map(([shape]) => shape.feature) },
  };
}
