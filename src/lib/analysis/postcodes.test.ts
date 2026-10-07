import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { analyseActivity } from './analyseActivity';
import boundaries from './fixtures/postcodes.geojson?raw';
import localities from './fixtures/postcode-localities.json';
import { buildPostcodeIndex } from './postcodes';

// Fixture boundaries: a 2×2 grid of 0.01° squares, 2003 2004 over 2001 2002, split at lon 151.18 and
// lat -33.90; 2005 to the east across a 0.01° "water" strip (lon 151.19 to 151.20); and further east 2006,
// a U around a bay (lon 151.23–151.24, lat -33.905 to -33.90).
const index = buildPostcodeIndex(
  JSON.parse(boundaries) as FeatureCollection<Polygon | MultiPolygon, { code: string }>,
  localities,
);

// At lat -33.905: 0.001° of longitude = 6371000 × π/180 × 0.001 × cos(33.905°) ≈ 92.29 m.
const M_PER_MILLIDEGREE_LON = 92.29;

/** A GPX track through [lon, lat] points, 5 min apart (slow enough that no step looks like a GPS spike). */
function track(points: [number, number][]): string {
  const pts = points
    .map(([lon, lat], i) => {
      const t = new Date(Date.UTC(2026, 8, 27, 20, i * 5, 0)).toISOString();
      return `<trkpt lat="${lat}" lon="${lon}"><time>${t}</time></trkpt>`;
    })
    .join('');
  return `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><type>running</type><trkseg>${pts}</trkseg></trk></gpx>`;
}

const postcodesOf = (points: [number, number][]) =>
  analyseActivity(track(points), { postcodes: index }).postcodes;

/** Two recorded segments in one track: a stop in recording between them. */
function twoSegments(first: [number, number][], second: [number, number][]): string {
  const seg = (points: [number, number][], offsetMin: number) =>
    `<trkseg>${points
      .map(([lon, lat], i) => {
        const t = new Date(Date.UTC(2026, 8, 27, 20, offsetMin + i * 5, 0)).toISOString();
        return `<trkpt lat="${lat}" lon="${lon}"><time>${t}</time></trkpt>`;
      })
      .join('')}</trkseg>`;
  return `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><type>running</type>${seg(first, 0)}${seg(second, 120)}</trk></gpx>`;
}

describe('postcodes passed through', () => {
  it('lists postcodes in the order entered, with the distance inside each and their localities', () => {
    const result = postcodesOf([
      [151.172, -33.905],
      [151.178, -33.905],
      [151.186, -33.905],
    ]);
    expect(result?.passed.map((p) => p.code)).toEqual(['2001', '2002']);
    expect(result?.passed[0]?.distanceM).toBeCloseTo(8 * M_PER_MILLIDEGREE_LON, 0);
    expect(result?.passed[1]?.distanceM).toBeCloseTo(6 * M_PER_MILLIDEGREE_LON, 0);
    expect(result?.passed[0]?.localities).toEqual(['Alpha', 'Alpha West']);
  });

  it('catches a postcode clipped between two sparse points that both lie elsewhere', () => {
    // One 1.64 km step from 2003 to 2002 cuts the corner of 2004 between t = 5/13 and t = 1/2 (≈ 189 m).
    const result = postcodesOf([
      [151.175, -33.895],
      [151.188, -33.905],
    ]);
    expect(result?.passed.map((p) => p.code)).toEqual(['2003', '2004', '2002']);
    expect(result?.passed[1]?.distanceM).toBeCloseTo(189, -1);
  });

  it('ignores a postcode the route strays into for less than 50 m along a boundary road', () => {
    // Running north just inside 2001's eastern edge, once drifting ~0.0002° (18 m) into 2002: the steps in
    // and out are 38.6 m each and half of each lies in 2002, so ~38.6 m there.
    const result = postcodesOf([
      [151.1798, -33.9095],
      [151.1798, -33.9094],
      [151.1802, -33.9093],
      [151.1798, -33.9092],
      [151.1798, -33.9091],
    ]);
    expect(result?.passed.map((p) => p.code)).toEqual(['2001']);
  });

  it('measures the distance outside any postcode when crossing water', () => {
    const result = postcodesOf([
      [151.185, -33.905],
      [151.205, -33.905],
    ]);
    expect(result?.passed.map((p) => p.code)).toEqual(['2002', '2005']);
    expect(result?.outsideM).toBeCloseTo(10 * M_PER_MILLIDEGREE_LON, 0);
  });

  it('lists a re-entered postcode once, at its first entry, with its distance summed', () => {
    const result = postcodesOf([
      [151.175, -33.905],
      [151.185, -33.905],
      [151.172, -33.905],
    ]);
    expect(result?.passed.map((p) => p.code)).toEqual(['2001', '2002']);
    // 2001: 0.005° out + 0.008° back.
    expect(result?.passed[0]?.distanceM).toBeCloseTo(13 * M_PER_MILLIDEGREE_LON, 0);
  });

  it('keeps the start postcode when no postcode reaches 50 m', () => {
    const result = postcodesOf([
      [151.175, -33.905],
      [151.1753, -33.905],
    ]);
    expect(result?.passed.map((p) => p.code)).toEqual(['2001']);
  });

  it('reports a route that never comes near the postcode data as outside Australia', () => {
    const result = postcodesOf([
      [172.63, -43.53],
      [172.64, -43.53],
    ]);
    expect(result).toMatchObject({ overlapsAustralia: false, passed: [] });
  });

  it('reports a route over the data but inside no postcode as having none', () => {
    const result = postcodesOf([
      [151.192, -33.905],
      [151.198, -33.905],
    ]);
    expect(result).toMatchObject({ overlapsAustralia: true, passed: [] });
    expect(result?.outsideM).toBeCloseTo(6 * M_PER_MILLIDEGREE_LON, 0);
  });

  it('checks a long step whose ends share a postcode for anything it crosses in between', () => {
    // One step across the bay, from one arm of 2006 to the other: 0.010° of it is water.
    const result = postcodesOf([
      [151.225, -33.9025],
      [151.245, -33.9025],
    ]);
    expect(result?.passed.map((p) => p.code)).toEqual(['2006']);
    expect(result?.outsideM).toBeCloseTo(10 * M_PER_MILLIDEGREE_LON, 0);
  });

  it('does not count the unrecorded gap between two segments as passing through postcodes', () => {
    // Recorded in 2001, then (after a stop in recording) in 2005; the straight line between crosses 2002.
    const summary = analyseActivity(
      twoSegments(
        [
          [151.171, -33.905],
          [151.175, -33.905],
        ],
        [
          [151.205, -33.905],
          [151.209, -33.905],
        ],
      ),
      { postcodes: index },
    );
    expect(summary.postcodes?.passed.map((p) => p.code)).toEqual(['2001', '2005']);
    expect(summary.postcodes?.outsideM).toBe(0);
  });
});
