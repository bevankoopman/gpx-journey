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

  it('counts moving time only while moving, excluding stops and gaps between segments', () => {
    const summary = analyseActivity(fixture('paused-run.gpx'));
    expect(summary.timed).toBe(true);
    expect(summary.movingS).toBe(60);
    expect(summary.elapsedS).toBe(480);
  });

  it('does not count GPS wobble while standing still as moving', () => {
    const summary = analyseActivity(fixture('standing-wobble.gpx'));
    expect(summary.elapsedS).toBe(30);
    // Point-to-point speed would call all 30 s moving; at most the first step (no 10 s history yet) counts.
    expect(summary.movingS).toBeLessThanOrEqual(1);
  });

  it('treats a file as untimed when under 90% of points have timestamps', () => {
    expect(analyseActivity(fixture('mostly-untimed.gpx'))).toMatchObject({
      timed: false,
      movingS: null,
      elapsedS: null,
    });
    expect(analyseActivity(fixture('one-untimed.gpx'))).toMatchObject({ timed: true, elapsedS: 90 });
    expect(analyseActivity(fixture('untimed-spike.gpx')).timed).toBe(false);
  });

  it('measures elevation gain with a 5 m dead band, ignoring smaller dips', () => {
    expect(analyseActivity(fixture('hill-run.gpx')).elevationGainM).toBe(15);
  });

  it('measures a climb from the true bottom of a gradual descent', () => {
    expect(analyseActivity(fixture('valley.gpx')).elevationGainM).toBe(10);
  });

  it('gives no elevation gain when under 90% of points have elevation', () => {
    expect(analyseActivity(fixture('multi-track.gpx')).elevationGainM).toBeNull();
  });

  it('reports the start time and the timezone where the activity started', () => {
    expect(analyseActivity(fixture('single-segment.gpx'))).toMatchObject({
      startTime: Date.parse('2026-09-27T20:42:10Z'),
      timeZone: 'Australia/Sydney',
    });
    expect(analyseActivity(fixture('perth-ride.gpx'))).toMatchObject({
      startTime: Date.parse('2026-09-27T23:15:00Z'),
      timeZone: 'Australia/Perth',
    });
    expect(analyseActivity(fixture('mostly-untimed.gpx'))).toMatchObject({ startTime: null, timeZone: null });
  });

  it('counts movement straight after a pause inside a segment', () => {
    expect(analyseActivity(fixture('auto-pause.gpx')).movingS).toBe(120);
  });

  describe('activity type', () => {
    it.each([
      ['strava-numeric-run.gpx', 'running', '9'],
      ['strava-numeric-ride.gpx', 'cycling', '1'],
      ['single-segment.gpx', 'running', 'running'],
      ['strava-route-ride.gpx', 'cycling', 'Ride'],
      ['garmin-trail-run.gpx', 'running', 'trail_running'],
      ['garmin-power.gpx', 'cycling', 'cycling'],
    ])('reads %s as %s from its <type> "%s"', (file, activityType, label) => {
      expect(analyseActivity(fixture(file))).toMatchObject({
        activityType,
        typeSource: 'file',
        source: { typeLabel: label },
      });
    });

    it('falls back to cycling when the file has power data but no <type>', () => {
      expect(analyseActivity(fixture('power-ride.gpx'))).toMatchObject({
        activityType: 'cycling',
        typeSource: 'power',
      });
    });

    it('guesses from average moving speed when there is no <type> or power data', () => {
      // 25 km/h: clearly a ride.
      expect(analyseActivity(fixture('fast-no-type.gpx'))).toMatchObject({
        activityType: 'cycling',
        typeSource: 'speed',
        typeUncertain: false,
      });
      // 13.3 km/h: a run, but inside the 12–18 km/h band where runs and rides overlap.
      expect(analyseActivity(fixture('overlap-speed-no-type.gpx'))).toMatchObject({
        activityType: 'running',
        typeSource: 'speed',
        typeUncertain: true,
      });
      // 10.8 km/h: clearly a run.
      expect(analyseActivity(fixture('one-untimed.gpx'))).toMatchObject({
        activityType: 'running',
        typeSource: 'speed',
        typeUncertain: false,
      });
    });

    it('defaults to running when there is no <type> and no timestamps to judge speed', () => {
      expect(analyseActivity(fixture('mostly-untimed.gpx'))).toMatchObject({
        activityType: 'running',
        typeSource: 'default',
      });
    });

    it("uses the user's choice, including that type's spike limit", () => {
      const asRide = analyseActivity(fixture('gps-spike.gpx'), { activityType: 'cycling' });
      expect(asRide).toMatchObject({ activityType: 'cycling', typeSource: 'user' });
      // The 111 km/h jump is a spike for a run (60 km/h limit) but plausible for a ride (120 km/h).
      expect(asRide.route).toHaveLength(4);
      expect(analyseActivity(fixture('gps-spike.gpx'), { activityType: 'running' }).route).toHaveLength(3);
    });

    // The full agreed mapping, case-insensitive.
    const withType = (type: string) =>
      fixture('strava-numeric-run.gpx').replace('<type>9</type>', `<type>${type}</type>`);
    it.each(['9', 'running', 'TRAIL_RUNNING', 'treadmill_running', 'Run', '10', '4', 'walking', 'Hiking'])(
      'maps <type>%s</type> to running',
      (type) => expect(analyseActivity(withType(type)).activityType).toBe('running'),
    );
    it.each([
      '1',
      'Cycling',
      'Ride',
      'ebikeride',
      'touring_bicycle',
      'road_biking',
      'mountain_biking',
      'gravel_cycling',
    ])('maps <type>%s</type> to cycling', (type) =>
      expect(analyseActivity(withType(type)).activityType).toBe('cycling'),
    );
  });
});
