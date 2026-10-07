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
  import type { FeatureCollection } from 'geojson';
  import type { LonLat } from '../analysis/geo';
  import { MAP_ATTRIBUTION } from '../credits';
  import { PHONE_QUERY } from './layout';

  let { route = null }: { route?: readonly LonLat[] | null } = $props();

  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
  const AUSTRALIA: [[number, number], [number, number]] = [
    [112.9, -43.7],
    [153.7, -10.6],
  ];
  const ROUTE_COLOUR = '#e8590c'; // --route in app.css
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
      m.addSource('route', { type: 'geojson', data: EMPTY });
      m.addSource('start', { type: 'geojson', data: EMPTY });
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
      loaded = true;
    });

    return () => {
      phone.removeEventListener('change', onLayoutChange);
      m.remove();
      map = undefined;
    };
  });

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

<div class="map" bind:this={container}></div>

<style>
  .map {
    width: 100%;
    height: 100%;
  }
</style>
