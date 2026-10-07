<script lang="ts">
  import { AttributionControl, MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { onMount } from 'svelte';
  import { MAP_ATTRIBUTION } from '../credits';
  import { PHONE_QUERY } from './layout';

  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
  const AUSTRALIA: [[number, number], [number, number]] = [
    [112.9, -43.7],
    [153.7, -10.6],
  ];

  // MapLibre looks for its worker beside its own module, which bundling moves; point it at Vite's copy.
  setWorkerUrl(workerUrl);

  let container: HTMLDivElement;

  onMount(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      bounds: AUSTRALIA,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // `compact` left undefined (not false) off-phone so MapLibre can still go compact if the map narrows.
    map.addControl(
      new AttributionControl({ compact: phone.matches || undefined, customAttribution: MAP_ATTRIBUTION }),
    );

    // MapLibre opens a compact attribution and only folds it on drag; on phones it would cover the map,
    // so fold it on load and whenever the layout switches to phone (e.g. rotating to portrait).
    const fold = () => {
      if (phone.matches) {
        container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      }
    };
    map.once('load', fold);
    // MapLibre re-opens it when the map itself resizes into compact mode, so fold after that resize.
    const onLayoutChange = () => {
      fold();
      map.once('resize', fold);
    };
    phone.addEventListener('change', onLayoutChange);

    return () => {
      phone.removeEventListener('change', onLayoutChange);
      map.remove();
    };
  });
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    width: 100%;
    height: 100%;
  }
</style>
