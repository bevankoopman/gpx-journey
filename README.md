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

## Planning

Decisions are recorded on the closed [wayfinder map](https://github.com/bevankoopman/gpx-journey/issues/1) and its sub-issues. Domain terms are in `GLOSSARY.md`.

## Credits

Postcode boundaries: Postal Areas, ASGS Ed.3 (2021), © Commonwealth of Australia (ABS), CC BY 4.0, simplified. Map: OpenFreeMap © OpenMapTiles, data from OpenStreetMap contributors.
