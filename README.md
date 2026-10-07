# GPX Journey

Upload a GPX file of a run or ride and see the route on a map, its highlight figures (distance, moving and elapsed time, pace or speed, elevation gain) and the Australian postcodes it passed through. Everything runs in the browser, so the file never leaves your device.

Live at <https://bevankoopman.github.io/gpx-journey/>.

## Development

Requires Node 22 (see `.nvmrc`).

```sh
npm install
npm run dev        # local dev server
npm test           # Vitest
npm run typecheck  # svelte-check (strict TypeScript)
npm run lint       # ESLint + Prettier check
npm run build      # production build into dist/
```

Pushes to `main` that pass typecheck, lint, tests and build are deployed to GitHub Pages by `.github/workflows/ci.yml`. Pull requests run the same checks without deploying.

## Postcode data

The app ships its own postcode data in `src/data/postcodes/`, generated from ABS open data and committed:

- `poa-2021.topo.json`: ABS Postal Areas 2021 boundaries simplified to 25 m (mapshaper, `keep-shapes`), TopoJSON quantised at 1e6, layer `postcodes`, one feature per postcode with property `code`. 2,641 postcodes, about 1.9 MB brotli / 2.2 MB gzip.
- `poa-2021.localities.json`: `{ "<postcode>": [up to 3 locality names] }`, ranked by 2021 Census population, built by joining the ABS mesh block → postcode and mesh block → suburb/locality allocation files with the Census mesh block counts.

To regenerate (for example when ABS releases Postal Areas 2026, after adding it to `DATASETS` in the script):

```sh
npm run data:postcodes            # default dataset: poa-2021
npm run data:postcodes -- poa-2026
```

The script downloads about 110 MB from abs.gov.au into `.cache/abs/<dataset>/` (gitignored) and prints the postcode count and output sizes. Postal Areas approximate Australia Post postcodes: they are built from mesh blocks, leave out PO-box-only and other non-street postcodes, and are frozen at 2021.

## Performance

A 100,000-point GPX shows its results in about 1–1.5 s even with the CPU throttled 4×; analysis runs in a Web Worker so the page stays responsive. Method, numbers and caveats: `docs/performance.md`.

## Planning

Decisions are recorded on the closed [wayfinder map](https://github.com/bevankoopman/gpx-journey/issues/1) and its sub-issues. Domain terms are in `GLOSSARY.md`.

## Credits

Postcode boundaries and localities: Postal Areas and Suburbs and Localities, ASGS Ed.3 (2021), and Census 2021 mesh block counts, © Commonwealth of Australia (ABS), CC BY 4.0; boundaries simplified. Map: OpenFreeMap © OpenMapTiles, data from OpenStreetMap contributors.
