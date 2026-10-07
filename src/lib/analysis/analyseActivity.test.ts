import { describe, expect, it } from 'vitest';
import { analyseActivity } from './analyseActivity';

const fixtures = import.meta.glob<string>('./fixtures/*.gpx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
function fixture(name: string): string {
  const text = fixtures[`./fixtures/${name}`];
  if (text === undefined) throw new Error(`Missing fixture ${name}`);
  return text;
}

// 0.001° of latitude on a sphere of radius 6,371 km = 6371000 × π/180 × 0.001 m.
const M_PER_MILLIDEGREE_LAT = 111.195;

describe('analyseActivity', () => {
  it('measures distance along a single segment', () => {
    const summary = analyseActivity(fixture('single-segment.gpx'));
    expect(summary.distanceM).toBeCloseTo(2 * M_PER_MILLIDEGREE_LAT, 1);
  });

  it('merges tracks and segments in file order, bridging the gaps between segments', () => {
    const summary = analyseActivity(fixture('multi-track.gpx'));
    expect(summary.route).toEqual([
      [151.18, -33.9],
      [151.18, -33.899],
      [151.18, -33.898],
      [151.18, -33.897],
      [151.18, -33.896],
      [151.18, -33.895],
    ]);
    // 3 steps inside segments + 2 straight-line gaps between segments.
    expect(summary.distanceM).toBeCloseTo(5 * M_PER_MILLIDEGREE_LAT, 1);
  });

  it("reads the activity type from the track's own <type>, not a <link>'s MIME type", () => {
    const summary = analyseActivity(fixture('link-type-trap.gpx'));
    expect(summary.source.typeLabel).toBe('cycling');
  });

  it('captures the creator and whether the file carries power data', () => {
    expect(analyseActivity(fixture('power-ride.gpx')).source).toMatchObject({
      creator: 'Wahoo ELEMNT BOLT',
      hasPower: true,
    });
    expect(analyseActivity(fixture('garmin-power.gpx')).source).toMatchObject({
      creator: 'Garmin Connect',
      hasPower: true,
    });
    expect(analyseActivity(fixture('single-segment.gpx')).source).toMatchObject({
      creator: 'StravaGPX',
      hasPower: false,
    });
  });

  it('drops GPS spikes faster than the running limit (60 km/h) from distance and route', () => {
    const summary = analyseActivity(fixture('gps-spike.gpx'));
    expect(summary.route).toEqual([
      [151.18, -33.9],
      [151.18, -33.899],
      [151.18, -33.898],
    ]);
    expect(summary.distanceM).toBeCloseTo(2 * M_PER_MILLIDEGREE_LAT, 1);
  });

  it('keeps every point when there are no timestamps to judge speed by', () => {
    expect(analyseActivity(fixture('untimed-spike.gpx')).route).toHaveLength(4);
  });

  it('drops a wild first fix instead of measuring the real track against it', () => {
    const summary = analyseActivity(fixture('cold-start.gpx'));
    expect(summary.route).toHaveLength(4);
    expect(summary.route[0]).toEqual([151.18, -33.9]);
    expect(summary.distanceM).toBeCloseTo(3 * M_PER_MILLIDEGREE_LAT, 1);
  });

  it('ignores track points with missing or impossible coordinates', () => {
    const summary = analyseActivity(fixture('bad-coordinates.gpx'));
    expect(summary.route).toEqual([
      [151.18, -33.9],
      [151.18, -33.899],
      [151.18, -33.898],
    ]);
    expect(summary.distanceM).toBeCloseTo(2 * M_PER_MILLIDEGREE_LAT, 1);
  });

  it('rejects a GPX file that has no track points', () => {
    expect(() => analyseActivity(fixture('no-track-points.gpx'))).toThrow('No track points found');
  });
});
