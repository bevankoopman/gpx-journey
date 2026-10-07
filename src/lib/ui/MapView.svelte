<script lang="ts">
  import {
    AttributionControl,
    LngLatBounds,
    MapLibreMap,
    NavigationControl,
    setWorkerUrl,
    type GeoJSONSource,
  } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { onMount } from 'svelte';
  import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
  import type { LonLat } from '../analysis/geo';
  import { MAP_ATTRIBUTION } from '../credits';
  import { PHONE_QUERY } from './layout';

  let {
    route = null,
    postcodes = null,
    highlighted = null,
    onhoverpostcode = () => {},
    onselectpostcode = () => {},
  }: {
    route?: readonly LonLat[] | null;
    /** Boundaries of the postcodes passed through, shaded under the route. */
    postcodes?: FeatureCollection<Polygon | MultiPolygon, { code: string }> | null;
    /** Postcode highlighted here and in the list. */
    highlighted?: string | null;
    onhoverpostcode?: (code: string | null) => void;
    onselectpostcode?: (code: string) => void;
  } = $props();

  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
  const AUSTRALIA: [[number, number], [number, number]] = [
    [112.9, -43.7],
    [153.7, -10.6],
  ];
  const ROUTE_COLOUR = '#c2410c'; // --route in app.css
  const POSTCODE_COLOUR = '#1971c2'; // --postcode in app.css
  const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

  // MapLibre looks for its worker beside its own module, which bundling moves; point it at Vite's copy.
  setWorkerUrl(workerUrl);

  let container: HTMLDivElement;
  let map: MapLibreMap | undefined;
  let loaded = $state(false);

  onMount(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    const m = new MapLibreMap({
      container,
      style: STYLE_URL,
      bounds: AUSTRALIA,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
    });
    map = m;
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // `compact` left undefined (not false) off-phone so MapLibre can still go compact if the map narrows.
    m.addControl(
      new AttributionControl({ compact: phone.matches || undefined, customAttribution: MAP_ATTRIBUTION }),
    );

    // MapLibre opens a compact attribution and only folds it on drag; on phones it would cover the map,
    // so fold it on load and whenever the layout switches to phone (e.g. rotating to portrait).
    const fold = () => {
      if (phone.matches) {
        container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      }
    };
    // MapLibre re-opens it when the map itself resizes into compact mode, so fold after that resize.
    const onLayoutChange = () => {
      fold();
      m.once('resize', fold);
    };
    phone.addEventListener('change', onLayoutChange);

    m.once('load', () => {
      fold();
      m.addSource('postcodes', { type: 'geojson', data: EMPTY, promoteId: 'code' });
      m.addLayer({
        id: 'postcode-fill',
        type: 'fill',
        source: 'postcodes',
        paint: {
          'fill-color': POSTCODE_COLOUR,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hl'], false], 0.35, 0.1],
        },
      });
      m.addLayer({
        id: 'postcode-line',
        type: 'line',
        source: 'postcodes',
        paint: {
          'line-color': POSTCODE_COLOUR,
          'line-width': ['case', ['boolean', ['feature-state', 'hl'], false], 2.5, 1],
          'line-opacity': 1,
        },
      });
      m.addLayer({
        id: 'postcode-label',
        type: 'symbol',
        source: 'postcodes',
        layout: { 'text-field': ['get', 'code'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] },
        paint: { 'text-color': POSTCODE_COLOUR, 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });
      m.addSource('route', { type: 'geojson', data: EMPTY });
      m.addSource('start', { type: 'geojson', data: EMPTY });
      // A white casing under the route keeps it visible (3:1) over water and pale land alike.
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7 },
      });
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_COLOUR, 'line-width': 4 },
      });
      m.addLayer({
        id: 'start',
        type: 'circle',
        source: 'start',
        paint: {
          'circle-radius': 6,
          'circle-color': '#fff',
          'circle-stroke-color': ROUTE_COLOUR,
          'circle-stroke-width': 3,
        },
      });
      // Hovering shading highlights it (and its row); clicking or tapping picks it.
      const codeAt = (e: { features?: { properties: Record<string, unknown> }[] }) =>
        e.features?.[0]?.properties.code as string | undefined;
      m.on('mousemove', 'postcode-fill', (e) => {
        m.getCanvas().style.cursor = 'pointer';
        onhoverpostcode(codeAt(e) ?? null);
      });
      m.on('mouseleave', 'postcode-fill', () => {
        m.getCanvas().style.cursor = '';
        onhoverpostcode(null);
      });
      m.on('click', 'postcode-fill', (e) => {
        const code = codeAt(e);
        if (code) onselectpostcode(code);
      });
      loaded = true;
    });

    return () => {
      phone.removeEventListener('change', onLayoutChange);
      m.remove();
      map = undefined;
    };
  });

  // Shade the postcodes passed through (independent of the route, so re-analysis doesn't refit the view).
  $effect(() => {
    if (!loaded || !map) return;
    map.getSource<GeoJSONSource>('postcodes')?.setData(postcodes ?? EMPTY);
  });

  // Mirror the shared highlight onto the shading.
  let shown: string | null = null;
  $effect(() => {
    if (!loaded || !map || !map.getSource('postcodes')) return;
    if (shown && shown !== highlighted)
      map.setFeatureState({ source: 'postcodes', id: shown }, { hl: false });
    if (highlighted) map.setFeatureState({ source: 'postcodes', id: highlighted }, { hl: true });
    shown = highlighted;
  });

  /** Fit the view to one of the shaded postcodes. */
  export function zoomToPostcode(code: string) {
    const shape = postcodes?.features.find((f) => f.properties.code === code);
    if (!map || !shape) return;
    const g = shape.geometry;
    const points = (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()).flat();
    const [lon, lat] = points[0] ?? [];
    if (lon === undefined || lat === undefined) return;
    const bounds = points.reduce((b, [x, y]) => b.extend([x!, y!]), new LngLatBounds([lon, lat], [lon, lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
  }

  // Draw the route, or clear it and return to Australia, whenever it changes once the style is ready.
  $effect(() => {
    if (!loaded || !map) return;
    const routeSource = map.getSource<GeoJSONSource>('route');
    const startSource = map.getSource<GeoJSONSource>('start');
    const first = route?.[0];
    if (!route || !first) {
      routeSource?.setData(EMPTY);
      startSource?.setData(EMPTY);
      map.fitBounds(AUSTRALIA, { padding: 24 });
      return;
    }
    const coordinates = route.map(([lon, lat]) => [lon, lat]);
    routeSource?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
    startSource?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [...first] },
    });
    const bounds = route.reduce(
      (b, [lon, lat]) => b.extend([lon, lat]),
      new LngLatBounds([...first], [...first]),
    );
    map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 600 });
  });
</script>

<div class="map" bind:this={container} role="region" aria-label="Map of the route and postcodes"></div>

<style>
  .map {
    width: 100%;
    height: 100%;
  }
</style>
