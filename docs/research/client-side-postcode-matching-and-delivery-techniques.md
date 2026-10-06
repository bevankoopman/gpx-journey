# Client-side postcode matching and delivery techniques

Ticket: [02](../issues/02-client-side-postcode-matching-and-delivery-techniques.md). Researched 2026-10-06.

Question: how to (a) ship about 2,600 postcode polygons to a static web app and (b) work out which polygons a GPS track passes through, all in the browser. Also: how each option fits Leaflet or MapLibre GL rendering, and which free basemaps allow this use.

This page lists facts and trade-offs. It does not pick an option.

## Method

- Claims about libraries and policies come from their own docs and READMEs, linked inline.
- The sizes and timings are my own measurements. I used the real ABS POA 2021 file (`POA_2021_AUST_GDA2020_SHP.zip`, 53 MB download, 2,644 records, 3 with null geometry, about 4.97 M vertices) ([ABS downloads](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files)).
- Simplification used mapshaper 0.6 with `keep-shapes`. Benchmarks ran in Node 23 on an Apple M2 Max, using flatbush and @turf/turf. Expect a mid-range phone to be about 3–5x slower; that figure is a rule of thumb, not a measurement.
- The scratch scripts are `bench.mjs` and `topo.mjs` in the session scratchpad. They are not part of the repo.
- The test track is synthetic: 100,000 points 5 m apart (about 500 km), a random walk across greater Sydney. It is dense urban postcode territory and the walk also crosses water. Real tracks will give different absolute numbers. The relative comparisons should still hold.

## (a) Delivery: payload size versus boundary accuracy

### Measured sizes

These are POA_CODE21-only attributes. GeoJSON coordinates are rounded to 5 decimal places (about 1 m). TopoJSON uses quantization.

| Simplification | Vertices | Mean / max displacement of removed vertices | GeoJSON raw / brotli | TopoJSON raw / brotli |
|---|---|---|---|---|
| none (source) | 4.97 M | 0 | 199 MB / 30.7 MB | n/a |
| interval 10 m | 2.11 M | n/a | 46 MB / 6.4 MB | 11.3 MB / 2.7 MB |
| interval 25 m | 1.34 M | n/a | 29.5 MB / 4.2 MB | 7.7 MB / 2.0 MB |
| interval 50 m | 0.90 M | 18 m / 4.2 km | 19.8 MB / 2.9 MB | 5.4 MB / 1.5 MB |
| 10% retained (about 95 m threshold) | n/a | 40 m / 9.7 km | 12.6 MB / 1.8 MB | 3.0 MB / 0.65 MB |
| 5% | n/a | 101 m / 20.6 km | 6.9 MB / 1.0 MB | 1.8 MB / 0.43 MB |
| 1% | 79 k | 583 m / 43 km | 2.0 MB / 0.29 MB | 0.77 MB / 0.18 MB |

What the table shows:

- **TopoJSON is 3–4x smaller than GeoJSON before compression, and about 1.5–2.5x smaller after brotli.** The gain comes from shared arcs, quantization and delta encoding ([TopoJSON spec](https://github.com/topojson/topojson-specification)). Postcode polygons tile the country, so almost every border is shared between two polygons. mapshaper simplifies shared borders consistently, so simplifying does not open gaps or overlaps ([mapshaper wiki](https://github.com/mbloch/mapshaper/wiki/Command-Reference)).
- **Decode cost is small.** Converting TopoJSON back to GeoJSON with `topojson-client.feature()`, including JSON.parse, took 270 ms at 10 m, 120 ms at 25 m and 30 ms at 5%.
- **Percentage-based simplification gets inaccurate fast in cities.** A few big remote polygons dominate the vertex budget. At 1%, the mean displacement is about 0.6 km, which is larger than many inner-city postcodes.
- **The max-displacement figures (km) come from huge outback and coastline polygons.** They matter less, but they show that percentage settings are hard to reason about. Interval (metre) settings are predictable.

### Matching accuracy against the unsimplified data

Same synthetic track, exact segment method. The unsimplified data gives 102 postcodes.

| Data | Postcodes found | Missing versus source | Extra |
|---|---|---|---|
| source | 102 | 0 | 0 |
| 10 m | 102 | 0 | 0 |
| 50 m | 102 | 0 | 0 |
| 5% | 97 | 5 | 0 |
| 1% | 90 | 12 | 0 |

The shortfall partly comes from the track running along water or coastline that the simplified polygons trim. That is a property of the synthetic track, but riverside and coastal paths are common in real runs and rides.

### Delivery options compared

**1. One file for all of Australia (TopoJSON or GeoJSON, fetched once and cached)**
- Benefits: simplest option, works on any static host, one HTTP-cached request, and all geometry is local, so matching is exact against whatever was shipped.
- Costs: payload is about 1.5–2.7 MB brotli at 10–50 m accuracy, or about 0.4–0.65 MB at 5–10% with a 40–100 m mean error. Parsing 10 m data takes about 0.3 s on desktop.
- Leaflet: fine if you render only the matched polygons (around 100). Rendering all 2,600 with 1 M+ vertices as SVG paths is heavy. `preferCanvas` switches to the Canvas renderer ([Leaflet reference](https://leafletjs.com/reference.html)).
- MapLibre: a `geojson` source tiles the data in a web worker. It applies its own Douglas-Peucker `tolerance` (default 0.375) for rendering only ([style spec, sources](https://maplibre.org/maplibre-style-spec/sources/)). Shading all polygons is fine.

**2. Per-state chunks, loaded by the track's bounding box**
- Benefits: a typical track loads one or two chunks. Measured at 25 m by first postcode digit (TopoJSON, brotli): 0 = 130 KB, 2 = 597 KB, 3 = 406 KB, 4 = 527 KB, 5 = 228 KB, 6 = 412 KB, 7 = 269 KB.
- Costs: the total of 2.57 MB is larger than the single file's 1.98 MB because arcs are no longer shared across chunks. You also need a bbox→chunk manifest. Postcode first digit does not map exactly to state (ACT and NT ranges, plus a few border postcodes), so chunk by digit or by bbox, not by "state".
- Leaflet and MapLibre: same as option 1, applied per chunk.

**3. Grid-tile chunks (for example 1° cells) loaded by track bbox**
- Benefits: a finer download than per-state.
- Costs: you must clip polygons to the cells, or duplicate polygons that span cells and de-duplicate by code. This is a custom build step.
- Leaflet and MapLibre: same as option 2.

**4. PMTiles vector tiles (tippecanoe → .pmtiles, fetched with HTTP Range requests)**
- Benefits: a single static file. Only the tiles in view are fetched ([PMTiles docs](https://docs.protomaps.com/pmtiles/)). Rendering at every zoom is native in MapLibre.
- Costs: the host must support Range requests and CORS ([PMTiles docs](https://docs.protomaps.com/pmtiles/)).
- Costs, accuracy: geometry is simplified to tile resolution at every zoom ([tippecanoe README](https://github.com/felt/tippecanoe)) and stored as integer tile coordinates, extent 4096 ([MVT spec 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1)). Polygons are split or duplicated across tiles.
- Costs, querying: MapLibre's `querySourceFeatures` only sees tiles that are currently loaded ([MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)), so it cannot be used to match a whole track.
- Leaflet: needs protomaps-leaflet, which is in maintenance mode ("recommended only for legacy Leaflet-based systems") ([protomaps-leaflet](https://github.com/protomaps/protomaps-leaflet)).
- MapLibre: first-class support via the `pmtiles` protocol.

**5. FlatGeobuf (one file with a packed Hilbert R-tree, bbox subsets fetched by Range request)**
- Benefits: lossless geometry. A bbox query downloads only the features it needs ([FlatGeobuf](https://github.com/flatgeobuf/flatgeobuf)). Fits a "fetch only polygons near the track" design.
- Costs: no shared-arc compression, so a full download is larger. Needs Range support. It was not in the ticket's list; I added it because it directly fits the "fetch by bbox" idea.
- Leaflet and MapLibre: decodes to GeoJSON, so render the same way as option 1.

**How accurate is vector-tile geometry for matching?** At extent 4096, one tile unit at zoom z is the tile width divided by 4096. Around 34°S that is about 8.1 km / 4096 ≈ 2 m at z12, and about 0.5 m at z14. That is accurate enough if you match against max-zoom tiles. The catch is volume:

- Matching a 500 km track means fetching and decoding every max-zoom tile along it, potentially hundreds of tiles.
- You must decode them yourself (for example with `@mapbox/vector-tile` plus `pmtiles`), outside the renderer.
- You must project tile coordinates back to lon/lat.
- Low-zoom tiles are much coarser: about 130 m per unit at z6.

So vector tiles are a good rendering format but an awkward matching format. One pattern is to match against a separate simplified TopoJSON or FlatGeobuf file and render from PMTiles. The cost is building two datasets.

## (b) Matching: spatial index and geometry test

### Indexes

- **flatbush** is a static packed Hilbert R-tree. Items cannot be added or removed after `finish()`. It is stored as one ArrayBuffer, which can be serialised or transferred to a worker (`Flatbush.from`). Its README reports 1 M rectangles indexed in 109 ms ([flatbush](https://github.com/mourner/flatbush)). It is a good fit because the postcode set never changes.
- **rbush** is a dynamic R-tree with insert, remove and bulk load. Its own README points to kdbush for static point sets ([rbush](https://github.com/mourner/rbush)). The dynamic features are not needed here.
- **geokdbush** does great-circle k-nearest-neighbour search over points only ([geokdbush](https://github.com/mourner/geokdbush)). It cannot answer "which polygon contains this point". It is only useful for side features such as "nearest postcode centroid".

### Geometry tests: point-in-polygon versus segment intersection

Times are for the 100k-point track, excluding parsing. Three methods were compared:

- **A, point-in-polygon:** flatbush over polygon-part bboxes, then a ray-casting test, with the last matched polygon cached.
- **B, segment–edge crossing:** flatbush over every polygon edge. The result is the polygon containing the first point plus the owner of every edge any track segment crosses. This is exact for straight segments.
- **C, turf:** `booleanIntersects` on 500-point line chunks against flatbush bbox candidates. `booleanIntersects` is implemented as `!booleanDisjoint` ([source](https://github.com/Turfjs/turf/blob/master/packages/turf-boolean-intersects/index.ts), [docs](https://turfjs.org/docs/api/booleanIntersects)).

| Data | Build polygon index | Build edge index (edges) | A time | B time | C time |
|---|---|---|---|---|---|
| source | 81 ms | 642 ms (4.96 M) | 525 ms | 46 ms | 534 ms |
| 10 m | 47 ms | 280 ms (2.10 M) | 144 ms | 35 ms | 165 ms |
| 50 m | 29 ms | 125 ms (0.89 M) | 51 ms | 33 ms | 77 ms |
| 5% | 11 ms | 56 ms (0.30 M) | 18 ms | 38 ms | 50 ms |
| 1% | 7 ms | 27 ms (76 k) | 10 ms | 35 ms | 38 ms |

**Short crossings are where the methods differ.**

- With points 5 m apart, A matched B on the source and 10 m data. On 50 m, 5% and 1% data, A missed one postcode (2072), a corner clipped between two fixes.
- Thinning the track to one point every 300 m (1,667 points, a realistic gap for sparse or "smart recording" GPX) made A miss 3–4 postcodes at every simplification level (for example 2072, 2082, 2566 on source data).
- B and C never disagreed with each other.

So point-in-polygon on the track points alone misses short crossings. Segment intersection, done either by B or by turf, catches them.

**Notes on each method:**

- **B (edge index)** costs the most memory: 2 M edges at 10 m is roughly 2 M × (16 B in the index + 32 B of coordinates) ≈ 100 MB as typed arrays. You can avoid that by indexing edges only for the polygons whose bbox touches the track bbox, or by using coarser data. Its matching time is nearly flat at about 35–45 ms.
- **C (turf)** needs no custom geometry code and was accurate. It was about 1–3x slower than A and up to 15x slower than B on detailed data, but still under about 0.6 s on desktop even on unsimplified data.
- **A** is the simplest and fastest on coarse data. It is also the only method that gives a per-point postcode, which is useful for time or distance spent in each postcode. You can combine it with B or C: run A for per-point labels, then a segment check only where consecutive points have different (or no) polygons.
- **All three run once per upload.** At 100k points every option finished well under 1 s on desktop. On a phone, the parse plus index-build cost of high-detail data matters more than the matching itself. A Web Worker keeps the UI responsive, and the flatbush buffer is transferable.

**POA coverage caveat.** POA polygons are clipped to the coastline and do not cover water. Points on a harbour, beach or ferry can fall into no postcode. Any method needs an explicit "no postcode" state.

## Rendering: Leaflet versus MapLibre GL

- **Leaflet** draws raster basemaps natively. Vector features (GeoJSON) render as SVG by default, or Canvas with `preferCanvas` ([Leaflet reference](https://leafletjs.com/reference.html)). It works well for a track plus around 100 shaded matched postcodes, and can struggle with all 2,600 detailed polygons. Vector basemaps (OpenFreeMap, Protomaps) need a plugin: MapLibre GL Leaflet, or the maintenance-mode protomaps-leaflet.
- **MapLibre GL JS** renders on WebGL. It can show all polygons shaded via a `geojson` or PMTiles vector source and highlight matched ones with `setFeatureState` / `promoteId` ([style spec](https://maplibre.org/maplibre-style-spec/sources/)). It is the native client for OpenFreeMap and Protomaps. Raster XYZ basemaps such as OSM also work as a `raster` source. It is a larger library than Leaflet.

## Free basemap tile providers

| Provider | Tile type | Cost and limits | Commercial use | Key or auth | Notes |
|---|---|---|---|---|---|
| OSM Standard (tile.openstreetmap.org) | raster | Free, best-effort, "no SLA or guarantee"; "We may block access, without notice" | Not prohibited, but heavy use is | None. Must send a valid Referer; must not send no-cache headers | Visible "© OpenStreetMap contributors" required. No bulk or offline prefetch ("any pre-emptive fetching of tiles other than those a user is actively viewing") ([policy](https://operations.osmfoundation.org/policies/tiles/)) |
| OpenFreeMap | vector (OpenMapTiles schema) | "completely free: there are no limits on the number of map views or requests" | Allowed | None, no registration | Attribution required: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". MapLibre is primary; Leaflet via the MapLibre GL Leaflet plugin ([site](https://openfreemap.org/), [quick start](https://openfreemap.org/quick_start/)) |
| Protomaps hosted API | vector | "free for non-commercial use. For commercial use, become a GitHub Sponsor" | Sponsor required | API key, with allowed origins per key (CORS list) | ([API](https://protomaps.com/api)) |
| Protomaps self-hosted PMTiles | vector | Only your hosting cost. Planet is about 120 GB; extract an Australia region with `pmtiles extract` and `--maxzoom` | Allowed (ODbL produced work, OSM attribution) | None | Docs say don't hotlink the build URLs ([downloads](https://docs.protomaps.com/basemaps/downloads)). Your host needs Range and CORS support |
| Stadia Maps free tier | raster and vector | 200,000 credits a month, no overage | "Commercial use not allowed" on free | Domain-based auth (Origin/Referer) for production web; localhost needs no key but is rate-limited | ([pricing](https://stadiamaps.com/pricing/), [auth](https://docs.stadiamaps.com/authentication/)) |

## Trade-offs to decide (not decided here)

1. **Accuracy versus payload.** Measured costs: about 1.5–2.7 MB brotli for 10–50 m boundaries, versus 0.4–0.65 MB for coarser 5–10% data that misses border postcodes in cities. Per-state chunks cut a typical download to about 0.1–0.6 MB.
2. **Point-in-polygon versus segment intersection.** Point-in-polygon only is simplest and gives per-point labels, but misses short crossings on sparse tracks. Segment intersection (custom edge index, or turf `booleanIntersects`) is exact. A hybrid is possible.
3. **Leaflet versus MapLibre.** Leaflet with raster OSM tiles is simple, but the OSM policy is best-effort with no SLA. MapLibre with OpenFreeMap (free, commercial OK, no key) or self-hosted PMTiles fits vector shading of all polygons.
4. **PMTiles.** Attractive for rendering every postcode at every zoom. Poor as the matching source unless you also ship a separate matching file.
