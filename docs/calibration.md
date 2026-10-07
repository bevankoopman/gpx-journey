# Calibration of the analysis settings

Settings live in `src/lib/analysis/settings.ts`. Reviewed 2026-10-07 ("Sample GPX set and tuning the settings", #19) against five real Strava exports (three runs and two rides around Brisbane), committed anonymised as `src/lib/analysis/fixtures/real/` (`scripts/anonymise-gpx.ts`: whitelist of positions, elevation, times and type; start, end and stops cut out). The Strava comparison below used the untrimmed originals, which are not committed.

## Elevation gain dead band: changed 5 m → 4 m

Strava exports carry smooth, corrected elevation: on these files the raw sum of rises is within ~2% of a 1 m dead band, so a 5 m band removes mostly genuine small climbs, not noise. Compared with the elevation gain Strava reports (untrimmed originals):

| Dead band | Road ride, 155 km (Strava 2,956 m) | Run, 15 km (Strava 156 m) | Mean abs. error |
|---|---|---|---|
| 2 m | 3,125 (+5.7%) | 169 (+8.6%) | 7.2% |
| 3 m | 3,082 (+4.3%) | 161 (+3.1%) | 3.7% |
| **4 m** | **3,030 (+2.5%)** | **150 (−3.6%)** | **3.0%** |
| 5 m (before) | 2,973 (+0.6%) | 142 (−9.1%) | 4.9% |
| 6 m | 2,930 (−0.9%) | 136 (−12.7%) | 6.8% |

4 m gives the lowest average error, with both activities within ~3.5% of Strava. Noisy phone-GPS elevation (not in this set) would come out somewhat higher than with 5 m; revisit if such files show inflated gains.

## Reviewed, unchanged

- **Moving time** (net displacement over a trailing 10 s window ≥ 1 km/h): the multi-hour pauses inside single segments in three files (paused at a destination, resumed for the trip home) are excluded correctly, while elapsed time includes them by definition. No Strava moving times were available to calibrate further.
- **Run/ride cut-off** (15 km/h, 12–18 km/h uncertain): the runs average 8–12 km/h and the rides 21–25 km/h, so a speed-only guess agrees with every file's own `<type>` and none falls in the uncertain band.
- **Spike limits** (60 km/h running, 120 km/h cycling): 2 points dropped across ~15,000; no visible effect on routes or figures.
- **50 m postcode minimum**: the closest call is a genuine 76 m pass through 4059 on two runs; no wobble postcodes appeared.
- **90% coverage rule**: every file is fully timed and has elevation.
- **Distance outside any postcode**: 1.1–1.8 km on the river-side runs and ride, where paths run at or beyond the simplified riverbank. This is expected given that Postal Areas stop at the bank.

## Not covered (no samples)

Garmin Connect and Komoot exports, an untimed planned route, sparse "smart recording", a ferry crossing, a partly-overseas route, and a ride through 40+ postcodes (the long ride passes 16). Synthetic fixtures cover these behaviours in the unit tests.
