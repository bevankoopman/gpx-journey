# Australian postcode boundary data

Research for [ticket 01](../issues/01-australian-postcode-boundary-data.md). Researched 2026-10-06.

Labels: **[measured]** means I downloaded the data and measured it with mapshaper 0.7.78 (Node, macOS). **[quoted]** means the figure comes from the cited source.

## 1. The boundary dataset: ABS ASGS Edition 3 Postal Areas (POA 2021)

### Where to download it
- ABS ASGS Edition 3 digital boundary files page: https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files
  - `POA_2021_AUST_GDA2020_SHP.zip`, ESRI Shapefile, 53.35 MB [quoted]. I downloaded 55,939,167 bytes, HTTP 200, from
    `https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/POA_2021_AUST_GDA2020_SHP.zip` [measured]
  - `POA_2021_AUST_GDA94_SHP.zip`, 52.98 MB [quoted]
  - For POA, that page lists only Shapefile. It has no GeoJSON, so GeoJSON or TopoJSON has to be made by converting the Shapefile (with mapshaper, ogr2ogr and similar tools).
- The download is a plain HTTPS GET with no login, so a build script could fetch it.

### Edition 4 status (as of 2026-10-06)
- ASGS Edition 4 (2026) came out on 22 July 2026, but so far it covers only the Main Structure and GCCSA (MB, SA1–SA4, GCCSA, S/T, AUS). Structures are being released "progressively". The Edition 4 page does not list POA or SAL yet, and gives no date for them [quoted]: https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/access-and-downloads/digital-boundary-files
- The ABS POA page says "subsequent changes to postcode boundary will not be reflected in Postal Areas until ASGS Edition 4 in 2026". This means POA 2021 does not include postcode changes made after 2021. A POA 2026 file is likely to appear later, and the project may want to swap it in when it does.

### Licence and attribution
- From the ABS boundary files page: "Copyright Commonwealth of Australia administered by the ABS. Unless otherwise noted, content is licensed under a Creative Commons Attribution 4.0 International licence." [quoted]
- ABS copyright page: https://www.abs.gov.au/website-privacy-copyright-and-disclaimer. It points to "Attributing ABS material" (https://www.abs.gov.au/websitedbs/d3310114.nsf/Home/Attributing+ABS+Material) and to citation guidance. The citation pattern is "Australian Bureau of Statistics (reference period) Title [URL], accessed DD Month YYYY".
- Suggested footer text for the app (my wording, built from CC BY 4.0 and the ABS copyright line): *"Postcode boundaries: Postal Areas, ASGS Edition 3 (2021), © Commonwealth of Australia (Australian Bureau of Statistics), CC BY 4.0. Simplified from the original."* CC BY 4.0 requires saying the data was changed, so the note about simplification is needed.

### Contents [measured]
- 2,644 records with CRS GDA2020 lon/lat (`+proj=longlat +ellps=GRS80`) and bounds 96.82 to 167.998 E, -43.74 to -9.14 S.
- 3 of those records have null geometry: `9494` No usual address, `9797` Migratory/Offshore/Shipping, and `ZZZZ` Outside Australia. That leaves **2,641 postal areas with geometry**. This agrees with the ABS figure of 2,644 POAs including "3 non-spatial special purpose codes" [quoted].
- Those polygons are made of 9,508 rings (counting multipolygon parts) with 4,964,362 vertices.
- Fields: `POA_CODE21` (for example '0800'), `POA_NAME21` (same as the code), `AREASQKM21`, `AUS_CODE21`, `AUS_NAME21`, `LOCI_URI21`, `SHAPE_Area`, `SHAPE_Leng`. There are no locality or suburb names.
- ABS states positional accuracy as about ±2 m in urban areas and ±10 m in rural and remote areas. Boundaries are generalised to 5 cm with a 7.5 cm shared-boundary tolerance [quoted, boundary files page].

### Raw sizes [measured]
| File | Size | gzip -9 |
|---|---|---|
| zip download | 55.9 MB | n/a |
| .shp unzipped | 79.7 MB | n/a |
| GeoJSON, POA_CODE21 only, full precision | 198.6 MB | 52.2 MB |
| GeoJSON, POA_CODE21 only, precision=0.00001 (about 1 m) | 108.4 MB | 24.7 MB |

The raw data is too big to ship to a browser.

## 2. Simplification results [measured]

Command pattern:
`mapshaper POA_2021_AUST_GDA2020.shp -filter-fields POA_CODE21 -simplify <amount> keep-shapes -o out.(geo|topo)json [precision=0.00001 | format=topojson quantization=…]`
- The default method is weighted Visvalingam. `interval=` is a distance, and for lon/lat data it is in metres. `keep-shapes` stops small features from disappearing. Simplification repairs intersections by default. (Source: `mapshaper -h simplify`; mapshaper is MPL-2.0; docs at https://mapshaper.org/docs/reference.html.)

**Accuracy test:** I made 30,000 seeded random points in bounding boxes over metro Sydney, Melbourne and Brisbane. Of these, 23,855 fall inside a raw POA; the rest are in the sea. I compared each point's postcode in the simplified layer with its postcode in the raw layer (precision 1e-5). The mismatch column is the share of points that change postcode, or fall into no postcode, after simplification. Because random points are uniform over metro areas, this approximates how often a GPS fix lands in a different postcode.

### By distance interval (best for reasoning about error)
| Simplification | Vertices | GeoJSON (1e-5) | gz | TopoJSON q=1e5 | gz | TopoJSON q=1e6 | gz | Mismatch vs raw (GeoJSON) |
|---|---|---|---|---|---|---|---|---|
| none | 4.96 M | 108.4 MB | 24.7 MB | n/a | n/a | n/a | n/a | 0 |
| interval=10 m | 2.11 M | 46.3 MB | 11.8 MB | 9.6 MB | 1.60 MB | 11.3 MB | 3.12 MB | 0.06% (14) |
| interval=50 m | 896 k | 19.8 MB | 5.19 MB | 4.4 MB | 1.02 MB | 5.4 MB | 1.66 MB | 0.44% (105) |
| interval=100 m | 544 k | 12.1 MB | 3.16 MB | 2.9 MB | 0.73 MB | 3.5 MB | 1.12 MB | 1.1% (265) |
| interval=250 m | 263 k | 6.0 MB | 1.51 MB | 1.6 MB | 0.45 MB | n/a | n/a | 3.6% (852) |

### By percentage of removable points retained
| Simplification | Vertices | GeoJSON (1e-5) | gz | TopoJSON q=1e5 | gz | Mismatch vs raw |
|---|---|---|---|---|---|---|
| 10% | n/a | 12.6 MB | 3.27 MB | 2.95 MB | 0.75 MB | n/a |
| 5% | n/a | 6.9 MB | 1.74 MB | 1.81 MB | 0.49 MB | n/a |
| 2% | n/a | 3.2 MB | 0.77 MB | 1.04 MB | 0.30 MB | n/a |
| 1% | 78.6 k | 2.0 MB | 0.44 MB | 0.77 MB | 0.22 MB | 14.6% |
| 0.5% | n/a | 1.35 MB | 0.27 MB | 0.63 MB | 0.18 MB | 18.1% |

What the numbers show:
- **TopoJSON quantization limits accuracy.** At quantization=1e5 over a box about 71° wide, the grid step is about 0.0007° (roughly 60–70 m). With interval=10 m, the mismatch rate went from 25 points at q=1e6 to 216 points at q=1e5. So q=1e5 adds about as much error as a 50–100 m simplification. TopoJSON gzips to about half the size of GeoJSON because shared borders are stored once.
- Percentage-based simplification at 1–2% looks fine at whole-country zoom but is badly wrong for point-in-polygon at street level: about 15% of metro points get the wrong postcode. It also drops coastal slivers (rings fall from 9,508 to 2,980). It is suitable only for a display layer.
- Middle-ground options: interval=50–100 m as TopoJSON q=1e6 is about 1.1–1.7 MB gzipped with about 0.4–1.1% point mismatch. interval=10 m is about 3 MB gzipped with about 0.1% mismatch.
- If size matters more, the data can be split, for example by state or into tiles loaded only for the track's bounding box, or the app can use a precise layer for matching and a coarse one for display. These are trade-offs to decide, not recommendations.
- The ABS polygons have shared edges (`SHAPE_*`, 7.5 cm shared-boundary tolerance) and are topologically clean, so mapshaper's topology-aware simplification leaves no gaps or overlaps between neighbours.

## 3. Accuracy caveats: POA vs Australia Post postcodes

Source: ABS POA page, https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/non-abs-structures/postal-areas [quoted]
- POAs are built from Mesh Blocks: "Mesh Blocks are allocated to Postal Areas based on the largest population contribution." Each mesh block goes to exactly one POA, so POA edges follow mesh-block edges rather than real postcode edges. The error is largest in rural areas, where mesh blocks are big.
- "Postal Areas exclude postcodes that are not street delivery areas. These include post office boxes, mail back competitions, large volume receivers and specialist delivery postcodes."
- Some street-delivery postcodes are missing too, when "a Mesh Block covers more than one whole postcode" or when the mesh blocks that partly cover a postcode were assigned to other POAs.
- Some postcodes cross state borders, and the POAs reflect this.
- The boundaries are frozen at 2021, so later Australia Post changes are not included until a 2026 edition.
- "ABS approximations of administrative boundaries do not match official legal boundaries and should only be used for statistical purposes."
- Australia Post's own postcode boundary and locality data is sold commercially, not open. Matthew Proctor's README says Australia Post "stopped" publishing the free list and now charges for it.

## 4. Postcode to locality/suburb names

| Source | What you get | Licence | Notes |
|---|---|---|---|
| **ABS ASGS Ed.3 allocation files** `POA_2021_AUST.xlsx` (17.7 MB) and `SAL_2021_AUST.xlsx` (19.5 MB), from https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/allocation-files | Mesh block to POA and mesh block to SAL (Suburbs and Localities, with names). Joining them on MB code gives a POA to suburb-name list, optionally weighted by mesh-block area or population. | CC BY 4.0 (ABS site default) [quoted, the allocation page itself doesn't restate it] | Consistent with the POA boundaries because both are built from the same mesh blocks. This has to be computed at build time; I did not run the join. SAL digital boundaries are also on the Ed.3 boundary files page if polygons are wanted. |
| **Matthew Proctor, australianpostcodes**: https://github.com/matthewproctor/australianpostcodes | CSV/JSON (CSV 8.8 MB) with postcode, locality, state, lat/long, SA1–SA4, LGA, electorates and more. Last major update 6 Sep 2025. | **No licence stated.** The GitHub API reports `license: null`. The README calls the data "community sourced" from public postal data and says the Australia Post database is "technically ... not meant to be republished". | Includes PO-box and non-street postcodes, so it is closer to Australia Post's list. Its legal status for redistribution is unclear. |
| **G-NAF (Geoscape)**: https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf (data.gov.au returned 403 to my fetcher; facts below are from search snippets of the data.gov.au EULA resource) | Every address with locality and postcode, so a postcode to locality mapping can be derived. | Open G-NAF EULA, based on CC BY 4.0, with extra terms. Must not be used to compile addresses for sending mail without checking each address against a second source, and use must be consistent with the Australian Privacy Principles. Attribution: "G-NAF © Geoscape Australia licensed by the Commonwealth of Australia under the Open Geo-coded National Address File (G-NAF) End User Licence Agreement." EULA: https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf/resource/09f74802-08b1-4214-a6ea-3591b2753d30 | Very large (multi-GB). The mapping would have to be preprocessed offline. Address postcodes are the real postal postcodes, not POA approximations. |

## 5. Not verified
- Whether the ABS also publishes POA as GeoPackage or through an ArcGIS/WFS service that could return GeoJSON directly. The boundary files page lists only Shapefile for POA.
- The exact G-NAF release cadence and size, because data.gov.au blocked my fetch.
- When Edition 4 POA and SAL will be released.

## Reproduction
The downloads and outputs were kept in a temporary working directory, not the repo. They were produced with `npm i mapshaper` (0.7.78) and the commands above. Test points: 10,000 per box, Sydney [150.9,-34.1,151.35,-33.7], Melbourne [144.8,-38.0,145.2,-37.7], Brisbane [152.9,-27.6,153.2,-27.3], joined with `mapshaper -points -join`.
