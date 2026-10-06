# GPX activity metric conventions

Research for [ticket 03](../issues/03-gpx-activity-metric-conventions.md). Researched 2026-10-06.

Labels: **[quoted]** means the claim comes from the cited source (doc text or source code I read). **[measured]** means I computed or sampled it myself (scripts in the session scratchpad). **[inferred]** means a vendor does not document it and the statement is my reading of indirect evidence.

## TL;DR

- No vendor publishes its exact algorithm. Strava and Garmin say *what* they do (flat-earth GPS distance, a speed threshold for moving time, a gain threshold for elevation, DEM correction) but not the constants, except Strava's elevation thresholds (10 m GPS, 2 m barometric).
- Open-source tools differ a lot in practice: gpxpy uses haversine/equirectangular, a 1 km/h stop threshold and 3-point elevation smoothing. GoldenCheetah uses haversine (R = 6371 km) and a 3 m hysteresis on elevation. GPXParser.js and gpxjs apply no smoothing at all.
- Haversine vs Vincenty makes less than 0.6% difference over a track [measured]. Elevation filtering is the metric where tools disagree by multiples, not percent.
- GPX cannot record timer pauses, so "moving time" from a GPX file has to be inferred from point speeds and time gaps by every tool, Strava included.
- `<type>` has no defined vocabulary in GPX 1.1. In the wild: Strava exports numeric codes (`1` Ride, `9` Run, `10` Walk, `4` Hike) in older files and lowercase strings (`running`, `cycling`, `walking`, `ebikeride`) in newer ones. Garmin Connect uses its activity keys (`running`, `trail_running`, `treadmill_running`, `cycling` ...). Komoot and Wahoo usually omit it.
- JS parsers: `@tmcw/togeojson` is the most used and best maintained, keeps segments apart and reads point extensions, but computes no stats (and has a `type` lookup gotcha, see section 6). `@we-gold/gpxjs` computes stats but joins all segments of a track into one point list. `gpxparser` has not been updated since 2021.

## 1. Distance

### What vendors say
- **Strava**: GPS distance assumes a flat surface: "a flat surface is assumed, and vertical speed from topography is not accounted for" [quoted]. If the file has a distance stream (from the device), Strava uses it. If not, Strava computes distance from the GPS points. It also offers "Correct Distance", which "can improve the quality of uploaded data by eliminating outlier GPS data". The filtering itself is not documented. https://support.strava.com/hc/en-us/articles/216919487-How-Distance-is-Calculated
- **Garmin Connect**: I found no first-party description of how it computes distance from GPX. **[inferred]** Garmin GPX exports generally carry no distance stream, and Connect shows the distance the device recorded (from FIT) for its own activities.

### What open-source tools do
- **gpxpy** (`gpxpy/geo.py`, dev branch) [quoted]
  - `EARTH_RADIUS = 6378.137 * 1000`, the WGS84 *equatorial* radius, not the 6371 km mean radius.
  - `distance()` uses haversine only when Δlat or Δlon is more than `HAVERSINE_THRESHOLD = 0.1`°. For closer points it uses a faster equirectangular approximation.
  - It has both `length_2d` and `length_3d`. `get_moving_data` uses `distance_3d` whenever both points have elevation.
  - https://github.com/tkrajina/gpxpy/blob/dev/gpxpy/geo.py
- **GoldenCheetah** (`src/FileIO/GpxParser.cpp`) [quoted]
  - When the GPX has a speed extension, it integrates speed over time.
  - Otherwise it uses 2D haversine with `r = 6371` km.
  - https://github.com/GoldenCheetah/GoldenCheetah/blob/master/src/FileIO/GpxParser.cpp
- **GPXParser.js**: haversine, R = 6371 km, 2D [quoted]. https://github.com/Luuka/GPXParser.js/blob/master/src/GPXParser.js
- **gpxjs** (`lib/math_helpers.ts`): haversine, `EARTH_RADIUS_METERS = 6371000`, 2D [quoted]. https://github.com/We-Gold/gpxjs

### How much the choices matter [measured]
I summed per-point distances along synthetic ~10 km tracks with 1e-4° steps and compared each method with Vincenty on WGS84:

| Latitude | Direction | hav R=6371 km | hav R=6378.137 km (gpxpy) |
|---|---|---|---|
| 0° | N–S | +0.56% | +0.67% |
| 0° | E–W | −0.11% | 0.00% |
| −27.5° | N–S | +0.35% | +0.46% |
| −27.5° | E–W | −0.18% | −0.07% |
| 45° | N–S | +0.06% | +0.17% |
| 60° | E–W | −0.36% | −0.25% |

- So for a run or ride, haversine against Vincenty is a 0.1–0.6% question, and the choice of radius alone shifts results by 0.11%.
- The GPS noise and sampling effects below are larger:
  - Jitter while standing still adds distance.
  - Sparse sampling cuts corners and loses distance.
- 2D vs 3D: on a steady 10% grade, 3D distance is √1.01 ≈ +0.5% longer. Over a whole activity the difference is usually far below that, but noisy GPS elevation makes 3D distance grow artificially. Strava (by its own statement) and most tools report 2D.

## 2. Moving time and elapsed time

### What GPX can carry
- GPX 1.1 has `<trkseg>` ("start a new Track Segment for each continuous span of track data" when reception is lost) and optional `<time>` on each point. It has no pause/resume or timer events (FIT has these, GPX does not) [quoted]. https://www.topografix.com/GPX/1/1/
- So "timer time" (time minus manual or auto pauses) is lost when a device exports GPX. **[inferred]** A pause on the device usually shows up in the GPX as a time gap between points, and sometimes as a new `<trkseg>`.

### What vendors say
- **Strava**: https://support.strava.com/hc/en-us/articles/115001188684-Moving-Time-Speed-and-Pace-Calculations
  - Definitions:
    - Elapsed time is "the duration from the moment you hit start ... to the moment you finish", stops included [quoted].
    - For runs, Strava uses the device's "timer time" and the phone accelerometer when it records the activity itself [quoted].
    - For rides, it "relies on GPS data ... to determine whether or not you are moving" with a speed threshold [quoted].
  - The threshold values are **not published**. Strava says only that it uses "standards that most athletes would agree upon" [quoted].
  - Strava shows pace and speed based on moving time, except for races and some sports [quoted].
  - **[inferred]** A GPX has no timer time, so Strava has to fall back to GPS-based moving time for GPX uploads of runs too.
- **Garmin**:
  - Devices have Auto Pause with options "When Stopped" or a "Custom Speed" threshold [quoted, e.g. Edge 530 manual: https://www8.garmin.com/manuals/webhelp/edge530/EN-US/GUID-C5E73CA9-B524-41D7-8D78-1114D9C35274.html].
  - Garmin Connect also shows a "Moving Time" computed after upload. Its threshold is undocumented. I found it only discussed in Garmin forums (low trust), e.g. https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/43048/moving-time

### What open-source tools do [quoted]
- **gpxpy** `get_moving_data()` (`gpxpy/gpx.py`)
  - Works pairwise on consecutive points. Speed = 3D distance (2D if elevation is missing) / Δt.
  - A pair with speed `<= stopped_speed_threshold` (default `DEFAULT_STOPPED_SPEED_THRESHOLD = 1` **km/h**) counts as stopped. Every other pair adds its *whole* Δt to moving time.
  - Max speed ignores the top 5% of speeds (`IGNORE_TOP_SPEED_PERCENTILES = 0.05`). `ignore_nonstandard_distances` drops pairs with abnormal distances. `raw=True` turns both filters off.
  - It works per segment, so a gap *between* segments never counts as moving.
  - Weak point: a long gap inside one segment with a little displacement (for example a 10-minute pause plus 50 m of drift = 0.3 km/h) counts as stopped. A gap where the device moved on during the pause (a tunnel) counts as moving. https://github.com/tkrajina/gpxpy/blob/dev/gpxpy/gpx.py
- **GoldenCheetah**
  - Resamples GPX to a fixed interval ("Garmin Smart Recording" handling). Gaps below a high-water mark are linearly interpolated; above it the speed is zeroed, i.e. treated as stopped.
  - "Time Moving" counts samples with `kph > 0.0`, and "Time Riding" counts `kph > 0 || cad > 0`. During interpolation, speeds ≤ 0.35 km/h are forced to 0 (`BasicRideMetrics.cpp`, `GpxParser.cpp`).
  - https://github.com/GoldenCheetah/GoldenCheetah/blob/master/src/Metrics/BasicRideMetrics.cpp
- **gpxjs** `calculateDuration`
  - Uses a rolling average speed over the previous 10 s window. Time counts as moving if that average is above `avgSpeedThreshold`, default `0.000215` m/ms = **0.774 km/h**.
  - `totalDuration` = last timed point minus first timed point (elapsed).
- **GPXParser.js**: computes no moving time.

### Typical conventions that emerge
- **Elapsed time** = last timestamp − first timestamp across the whole file (all tracks and segments). Everyone agrees on this.
- **Start time** = first `<trkpt><time>`. `<metadata><time>` is the file creation time and can differ, e.g. Strava sets it to the activity start, but other apps set it to the export time [inferred].
- **Moving time** = the sum of Δt over point pairs whose speed is above a threshold. Thresholds seen in source code: 0.35 km/h (GC), 0.77 km/h (gpxjs) and 1 km/h (gpxpy). None of them depends on the sport.
- Strava's undocumented thresholds are believed to be higher and to differ by sport. **[inferred]** No primary source gives numbers.
- Gaps between `<trkseg>` elements: gpxpy and GC count them as not moving. gpxjs merges segments, so the gap goes through its speed test.

## 3. Elevation gain

### What vendors say
- **Strava** [quoted]: https://support.strava.com/hc/en-us/articles/115001294564-Elevation-on-Strava-FAQs
  - Barometric-altimeter devices (known from a device database) keep the file's elevation.
  - Otherwise elevation is corrected against Strava's "database of barometric data" / elevation basemap.
  - Noise threshold: climbing must occur "consistently for more than 10 meters" for non-barometric data and "more than 2 meters" for barometric data before it counts.
  - Upload docs: "For devices with a barometric altimeter the elevation data is taken as is from the file, unless it is clearly inaccurate. Otherwise it is recomputed using the provided lat/lng points and an elevation database." A GPX can force file elevation by ending `creator` with "with Barometer". "To compute elevation gain noise must be removed from the elevation data and different algorithms/sites will produce different results." https://developers.strava.com/docs/uploads/
  - **[inferred]** "Consistently for more than N metres" reads like a hysteresis / dead-band filter similar to GoldenCheetah's, but the exact algorithm is not published.
- **Garmin Connect**:
  - Offers per-activity "Elevation Corrections", which replace device elevation with DEM elevation. Data sources discussed are USGS NED (US), CIT-S (Canada) and SRTM (rest of world), but that information comes from Garmin forums and I did not find it in a first-party support article. Garmin FAQ link referenced in search results: https://support.garmin.com/en-US/?faq=R4I5hFFcUk8gJPC4zi0Xv6 (not fetched).
  - Garmin's own gain filtering is undocumented.

### What open-source tools do [quoted]
- **gpxpy** `calculate_uphill_downhill`: 3-point weighted smoothing `0.3·prev + 0.4·cur + 0.3·next`, then the sum of positive differences. No threshold.
- **GoldenCheetah** `ElevationGain`: hysteresis with default **3.0 m** (user-configurable `GC_ELEVATION_HYSTERESIS`). It keeps a reference altitude, adds gain only when altitude rises more than `hysteresis` above the reference, then moves the reference. A drop of more than `hysteresis` moves the reference down.
- **GPXParser.js** and **gpxjs**: raw sum of positive deltas, no smoothing.

### How much the choices matter [measured, simulated]
- One hour at 1 Hz with *white* Gaussian noise. This is a pessimistic case, because real GPS altitude error is autocorrelated, which flatters raw sums less.

| Scenario | Raw | gpxpy 3-pt | Hyst 2 m | Hyst 3 m (GC) | Hyst 5 m | Hyst 10 m |
|---|---|---|---|---|---|---|
| Flat, σ=1 m | 2000 | 641 | 720 | 224 | 0 | 0 |
| 100 m hill, σ=1 m | 2022 | 636 | 748 | 292 | 100 | 96 |
| 100 m hill, σ=3 m | 6054 | 1919 | 5380 | 4720 | 3063 | 641 |

- The table only illustrates that the filter dominates the result. It does not reproduce any vendor's numbers.
- Real files differ:
  - Barometric `<ele>` is smooth.
  - Phone or GPS-only `<ele>` is noisy and quantised.
  - Some exports (e.g. Strava's own GPX export) contain the already-corrected elevation stream [inferred].
- **Barometric vs GPS in a GPX**: GPX has no flag for the elevation source. The only hints are the `creator` string (device name) and how smooth the data is [inferred].
- **DEM correction**: a static browser-only app cannot do this without shipping or fetching a DEM (SRTM tiles or an API). That is a product trade-off, not a fact to settle here.

## 4. Activity type: the GPX `<type>` element and other signals

### Spec
- `<type>` is an optional `xsd:string` on `wpt`, `rte` and `trk` ("Type (classification) of the track"). The vocabulary is **not** defined [quoted]. https://www.topografix.com/GPX/1/1/
- Element order inside `<trk>` is `name, cmt, desc, src, link*, number, type, extensions, trkseg*`, so `<link><type>` (a MIME type such as `text/html`) can come *before* the track's own `<type>` [quoted, schema].

### Observed values [measured]
I sampled public `.gpx` files on GitHub via code search, ~40 per query, and tallied the creator and the `<trk>`-level `<type>`:

| Source (`creator`) | `<trk><type>` values seen |
|---|---|
| `StravaGPX`, `StravaGPX iPhone`, `StravaGPX Android` (activity export) | Numeric: `1` (names "Morning/Afternoon/Evening/Night Ride"), `9` ("Morning Run", parkrun), `10` ("Lunch Walk", 步行/ウォーキング), `4` (hikes, GR20 stages), also `11`, `12`, `18` (rare, unidentified). Newer string form: `running`, `cycling`, `walking`, `ebikeride` |
| `StravaGPX` (route exports, apparently) | `Run`, `Ride` (capitalised) |
| `Garmin Connect` | Garmin activity-type keys: `running`, `trail_running`, `treadmill_running`, `cycling`, `elliptical`, `indoor_cardio`, `indoor_rowing`, `lap_swimming`, `strength_training`, `yoga` |
| `https://www.komoot.de` | Usually **absent**. One file had `touring_bicycle`. Komoot does include `<metadata><link><type>text/html</type>` |
| `Wahoo ELEMNT BOLT/ROAM` | Usually absent; `Other` seen. (Small, possibly synthetic sample, low confidence.) |
| `OsmAnd` | Usually absent; `Cycling` seen |
| `Apple Health Export` | Absent |

- **[inferred]** The mapping of Strava numeric codes (1 = Ride, 9 = Run, 10 = Walk, 4 = Hike) comes from correlating codes with the auto-generated activity names in those files. Strava does not document it. A Strava community thread confirms there is no published list: https://communityhub.strava.com/developers-api-7/gpx-trk-type-2404
- The values seen correspond to the legacy Strava activity-type list, but that also is unconfirmed.
- Strava's upload API documents activity-type detection only for TCX (`<Activity Sport="...">`) and FIT (`session.sport`), not for GPX [quoted]. https://developers.strava.com/docs/uploads/

### Other places the activity type shows up
- **`<trk><name>`**: Strava auto-names activities "Morning Run", "Afternoon Ride" etc., but **localised** (e.g. "Lauf am Morgen", "Sortie à vélo dans l'après-midi", 午後騎乘, 晚間步行). Users also rename them freely. So keyword matching on the name is unreliable and language-dependent [measured from samples].
- **`creator`** attribute: identifies the app or device (e.g. "Wahoo ELEMNT BOLT" is a bike computer). That is a weak hint about the sport, not proof.
- **Extensions**: Garmin TrackPointExtension (`gpxtpx:hr`, `gpxtpx:cad`, `gpxtpx:atemp`), and per Strava's upload doc also `power`, `cadence`, `heartrate`, `distance` [quoted]. `power` strongly suggests cycling. Cadence values overlap ambiguously: running cadence is often logged as ~80–95 per foot (or ~160–190 spm) and cycling as ~60–100 rpm [inferred].
- Nothing in GPX 1.1 itself names the sport beyond `<type>`.

### Speed heuristic when `<type>` is missing **[inferred, no primary source]**
I found no vendor or library that classifies run vs ride from GPX speed, so these figures are domain knowledge rather than citations:
- Running: recreational average moving speed is about 8–14 km/h (7:30–4:17 min/km). Elite marathon pace is about 21 km/h, a hard upper bound for sustained running.
- Cycling: typical average moving speed is about 15–30 km/h for recreational/road riding, lower (10–18 km/h) for commuting or mountain biking.
- Walking and hiking: about 3–6 km/h.
- So the overlap zone is about 12–18 km/h (fast runners vs slow, hilly or urban cyclists). Max sustained speed (e.g. the 95th-percentile point speed above ~25–30 km/h) and descent speed help separate the two. A heuristic that returns "unknown" in the overlap zone, or lets the user override, avoids confident misclassification.

## 5. Summary table of open-source defaults

| Tool | Distance | Moving threshold | Elevation filter | Segments |
|---|---|---|---|---|
| gpxpy | haversine above 0.1°, else equirectangular; R = 6378.137 km; 2D/3D both available | 1 km/h, pairwise | 3-pt smoothing 0.3/0.4/0.3 | kept separate |
| GoldenCheetah | speed-integrated, else haversine R = 6371 km | `kph > 0` after resampling (≤ 0.35 km/h zeroed) | 3 m hysteresis (configurable) | resampled to a time series |
| gpxjs 1.2.0 | haversine R = 6371 km | 0.774 km/h, 10 s rolling avg | none | merged per track |
| GPXParser.js 3.0.8 | haversine R = 6371 km | none | none | merged per track |
| Strava | flat-earth GPS, outlier filtering; device stream if present | undocumented, sport-specific | 10 m (GPS) / 2 m (baro) "consistent climbing"; DEM/basemap correction | — |
| Garmin Connect | undocumented | undocumented (device Auto Pause separate) | optional DEM "Elevation Corrections" | — |

## 6. JavaScript GPX parsers

npm data fetched 2026-10-06 [measured]:

| Package | Latest | Published | Weekly downloads | License |
|---|---|---|---|---|
| `@tmcw/togeojson` | 7.1.2 | 2025-05-31 | ~468,500 | BSD-2-Clause |
| `@we-gold/gpxjs` | 1.2.0 | 2026-07-04 | ~22,800 | MIT |
| `gpxparser` | 3.0.8 | 2021-06-07 | ~3,500 | MIT |
| `gpx-parser-builder` | 1.2.0 | 2025-12-09 | ~580 | MIT |

- **`@tmcw/togeojson`** (https://github.com/placemark/togeojson) [quoted from source]
  - Each `<trk>` becomes a Feature. One `<trkseg>` gives a `LineString`; several give a `MultiLineString`, so segment boundaries are kept.
  - Per-point times go in `properties.coordinateProperties.times` (nested per segment). Elevation becomes the third coordinate.
  - Point extensions: it flattens `gpxtpx:TrackPointExtension` children and maps `hr`/`gpxtpx:hr`/`heart` → `heart`. Other children (e.g. `power`, `gpxtpx:cad` → `cads`) become pluralised arrays in `coordinateProperties`.
  - Track `name`, `desc`, `type`, `time` → `properties`.
  - **Gotcha**: properties are read with `getElementsByTagName` (descendant search, first match). `type` can therefore pick up a `<link><type>text/html</type>` that comes before the real `<trk><type>`, and `time` returns the first descendant `<time>`, i.e. the first trkpt.
  - Computes **no** distance, time or elevation stats. Browser-native `DOMParser` input.
- **`@we-gold/gpxjs`** (https://github.com/We-Gold/gpxjs) [quoted from source]
  - TypeScript. Describes itself as a modernised successor of GPXParser.js.
  - Computes distance, total and moving duration, elevation and slopes per track.
  - Parses arbitrary `<extensions>` into objects at every level.
  - Reads `<trk><type>` through a schema mapping (direct children).
  - **Joins all `<trkseg>`s of a track into one `points` array**, and `segmentExtensions` keeps only the first segment's extensions (code comment in `lib/gpx_mapping.ts`). Segment gaps are lost for distance/moving-time purposes unless you re-parse.
  - Elevation gain is unsmoothed.
- **`gpxparser`** (GPXParser.js): last release 2021. `querySelectorAll('trkpt')` per track merges segments. No extension parsing. Raw elevation gain. Reads `track.type` correctly as a direct child.
- **`gpx-parser-builder`**: low usage. I did not check it in depth.

## 7. Open questions / not verified
- Strava's moving-time speed thresholds and Garmin Connect's moving-time and elevation-filter constants: not published anywhere I could find.
- Strava's numeric `<type>` codes beyond 1/4/9/10: unconfirmed.
- Komoot, Wahoo, Coros, Suunto and Polar exports: small samples. `<type>` is mostly absent, but there could be vendor-specific extensions I did not see.
