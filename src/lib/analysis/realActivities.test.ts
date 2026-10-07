// Regression tests on real Strava exports against the real postcode data. The fixtures were anonymised with
// scripts/anonymise-gpx.ts: only positions, elevation, times and type kept, timestamps shifted to 2026-01-01,
// and the start, end and every stop cut out with ~800 m randomly offset circles (splitting the track there).
// Expected values are the app's own outputs, checked for sanity when locked (2026-10-07), with tolerances
// so that tuning a setting slightly doesn't break them. Calibration against Strava: docs/calibration.md.
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import boundaries from '../../data/postcodes/poa-2021.topo.json?raw';
import localities from '../../data/postcodes/poa-2021.localities.json';
import { analyseActivity } from './analyseActivity';
import { buildPostcodeIndex } from './postcodes';

const fixtures = import.meta.glob<string>('./fixtures/real/*.gpx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const topology = JSON.parse(boundaries) as Topology;
const index = buildPostcodeIndex(
  feature(topology, topology.objects.postcodes!) as FeatureCollection<
    Polygon | MultiPolygon,
    { code: string }
  >,
  localities,
);

const cases = [
  {
    file: 'strava-run-a', // hilly trail run
    activityType: 'running',
    distanceKm: 8.69,
    movingS: 4048,
    elapsedS: 4142,
    elevationGainM: 316,
    postcodes: ['4066'],
  },
  {
    file: 'strava-run-b', // commute run, paused ~10 h at the destination
    activityType: 'running',
    distanceKm: 9.17,
    movingS: 2903,
    elapsedS: 40482,
    elevationGainM: 76,
    postcodes: ['4066', '4064', '4000', '4059'],
  },
  {
    file: 'strava-run-c', // commute run along the river, paused ~9 h
    activityType: 'running',
    distanceKm: 10.14,
    movingS: 3054,
    elapsedS: 37589,
    elevationGainM: 102,
    postcodes: ['4066', '4064', '4000', '4101', '4059'],
  },
  {
    file: 'strava-ride-short', // ride with a ~7.5 h pause
    activityType: 'cycling',
    distanceKm: 18.83,
    movingS: 2689,
    elapsedS: 31922,
    elevationGainM: 265,
    postcodes: ['4069', '4068', '4067'],
  },
  {
    file: 'strava-ride-long', // ~150 km hilly road ride
    activityType: 'cycling',
    distanceKm: 150.87,
    movingS: 21646,
    elapsedS: 24829,
    elevationGainM: 2937,
    postcodes: [
      '4069',
      '4066',
      '4061',
      '4054',
      '4055',
      '4520',
      '4306',
      '4521',
      '4311',
      '4305',
      '4304',
      '4303',
      '4301',
      '4300',
      '4076',
      '4074',
    ],
  },
];

describe('real activities', () => {
  it.each(cases)('$file', (expected) => {
    const text = fixtures[`./fixtures/real/${expected.file}.gpx`];
    if (text === undefined) throw new Error(`Missing fixture ${expected.file}`);
    const s = analyseActivity(text, { postcodes: index });

    expect(s.activityType).toBe(expected.activityType);
    expect(s.typeSource).toBe('file');
    expect(s.distanceM / 1000).toBeCloseTo(expected.distanceKm, 1); // ±50 m
    expect(Math.abs(s.movingS! - expected.movingS)).toBeLessThanOrEqual(expected.movingS * 0.01); // ±1%
    expect(s.elapsedS).toBe(expected.elapsedS); // first and last timestamps: exact
    expect(Math.abs(s.elevationGainM! - expected.elevationGainM)).toBeLessThanOrEqual(
      Math.max(3, expected.elevationGainM * 0.03),
    ); // ±3%
    expect(s.postcodes?.passed.map((p) => p.code)).toEqual(expected.postcodes);
  });

  it('would guess the same type from speed alone', () => {
    // Runs at 8–12 km/h and rides at 21–25 km/h sit clear of the 12–18 km/h overlap band.
    for (const { file, activityType } of cases) {
      const text = fixtures[`./fixtures/real/${file}.gpx`]!.replace(/<type>[^<]*<\/type>/, '');
      expect(analyseActivity(text)).toMatchObject({
        activityType,
        typeSource: 'speed',
        typeUncertain: false,
      });
    }
  });
});
