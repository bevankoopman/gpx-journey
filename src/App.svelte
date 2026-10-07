<script lang="ts">
  import type { ActivityType } from './lib/analysis/activityType';
  import type { ActivitySummary } from './lib/analysis/analyseActivity';
  import { onMount } from 'svelte';
  import { analyseInWorker, prefetchPostcodes } from './lib/analysis/client';
  import { CREDITS } from './lib/credits';
  import Analysing from './lib/ui/Analysing.svelte';
  import DropZone from './lib/ui/DropZone.svelte';
  import Figures from './lib/ui/Figures.svelte';
  import MapView from './lib/ui/MapView.svelte';
  import PostcodeList from './lib/ui/PostcodeList.svelte';
  import { errorMessage } from './lib/ui/errorMessage';
  import { spokenKm } from './lib/ui/format';

  type View =
    | { kind: 'upload'; error?: string }
    | { kind: 'analysing' }
    // The text is kept so the Run/Ride toggle can re-analyse without re-reading the file.
    | { kind: 'result'; summary: ActivitySummary; gpxText: string };

  // Raw: the summary is replaced wholesale, never mutated, and a long route must not become thousands of proxies.
  let view = $state.raw<View>({ kind: 'upload' });
  let dragging = $state(false);
  // The postcode highlighted in both the list and the map (hover/focus), and the components that act on picks.
  let highlighted = $state<string | null>(null);
  // Screen-reader announcements: progress and results politely, errors assertively. The regions are always in
  // the page (live regions inserted along with their text are announced unreliably).
  let status = $state('');
  let alertText = $state('');
  let alertTimer: ReturnType<typeof setTimeout> | undefined;
  function setAlert(message: string) {
    clearTimeout(alertTimer); // a pending, now stale, error must not land after the region is reset
    alertText = '';
    // Set after a beat, so the same message twice is announced twice.
    if (message) alertTimer = setTimeout(() => (alertText = message), 50);
  }
  function describe(summary: ActivitySummary): string {
    const pc = summary.postcodes;
    const postcodes =
      pc && pc.overlapsAustralia ? `, ${pc.passed.length} postcode${pc.passed.length === 1 ? '' : 's'}` : '';
    return `Analysis complete: ${spokenKm(summary.distanceM)}${postcodes}.`;
  }
  let mapView: MapView | undefined = $state();
  let postcodeList: PostcodeList | undefined = $state();

  // Fetch and index the postcode boundaries now, so they are usually ready by the time a file is chosen.
  onMount(prefetchPostcodes);
  // Only the latest file's analysis may land; a slower earlier one is ignored.
  let latest = 0;

  async function handleFile(file: File) {
    const request = ++latest;
    view = { kind: 'analysing' };
    highlighted = null;
    status = 'Analysing file…';
    setAlert('');
    try {
      const gpxText = await file.text();
      const summary = await analyseInWorker(gpxText);
      if (request === latest) {
        view = { kind: 'result', summary, gpxText };
        status = describe(summary);
      }
    } catch (err) {
      if (request === latest) {
        const message = errorMessage(err);
        view = { kind: 'upload', error: message };
        status = '';
        setAlert(message);
      }
    }
  }

  // Re-analyse as the chosen type (pace ↔ speed and that type's spike limit); the current result stays up meanwhile.
  async function chooseType(activityType: ActivityType) {
    if (view.kind !== 'result') return;
    // Invalidate any toggle still in flight first: tapping Ride then back to Run must end on Run.
    const request = ++latest;
    if (view.summary.activityType === activityType) return;
    const { gpxText } = view;
    try {
      const summary = await analyseInWorker(gpxText, activityType);
      if (request === latest) {
        view = { kind: 'result', summary, gpxText };
        status = `Showing as a ${activityType === 'running' ? 'run' : 'ride'}.`;
      }
    } catch {
      // Same text that already analysed; leave the current result in place.
    }
  }

  function newFile() {
    highlighted = null;
    status = 'Ready for a new file.';
    setAlert('');
    latest++;
    view = { kind: 'upload' };
  }

  // A GPX file can be dropped anywhere on the page, not just on the drop zone.
  function ondragover(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }
  function ondragleave(e: DragEvent) {
    if (!e.relatedTarget) dragging = false;
  }
  function ondrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) void handleFile(file);
  }
</script>

<svelte:window {ondragover} {ondragleave} {ondrop} />

<div class="sr-only" aria-live="polite">{status}</div>
<div class="sr-only" role="alert">{alertText}</div>

<div class="layout">
  <aside>
    <header>
      <h1>GPX Journey</h1>
      {#if view.kind === 'result'}<button type="button" onclick={newFile}>New file</button>{/if}
    </header>
    {#if view.kind === 'upload'}
      {#if view.error}<p class="error">{view.error}</p>{/if}
      <DropZone onfile={handleFile} {dragging} />
      <p class="muted small">
        Shows the route, distance, time, pace or speed, elevation gain and the Australian postcodes you passed
        through.
      </p>
    {:else if view.kind === 'analysing'}
      <Analysing />
    {:else}
      <Figures summary={view.summary} onchoosetype={chooseType} />
      <PostcodeList
        bind:this={postcodeList}
        result={view.summary.postcodes}
        {highlighted}
        onhover={(code) => (highlighted = code)}
        onselect={(code) => {
          highlighted = code;
          mapView?.zoomToPostcode(code);
        }}
      />
    {/if}
    <footer>{CREDITS}</footer>
  </aside>
  <div class="mapwrap">
    <MapView
      bind:this={mapView}
      {highlighted}
      onhoverpostcode={(code) => (highlighted = code)}
      onselectpostcode={(code) => {
        highlighted = code;
        postcodeList?.scrollToPostcode(code);
      }}
      route={view.kind === 'result' ? view.summary.route : null}
      postcodes={view.kind === 'result' ? (view.summary.postcodes?.shapes ?? null) : null}
    />
  </div>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 380px 1fr;
    height: 100vh;
    height: 100dvh;
  }
  aside {
    background: var(--panel);
    border-right: 1px solid var(--line);
    overflow: auto;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  header h1 {
    font-size: 17px;
    margin: 0;
  }
  header button {
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 13px;
  }
  .error {
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: #fff4ec;
    color: #a33f06;
    font-size: 14px;
  }
  footer {
    margin-top: auto;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.5;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .mapwrap {
    min-height: 0;
  }
  /* Phone: map pinned on top, sidebar scrolls underneath (PHONE_QUERY in lib/ui/layout.ts). */
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      height: auto;
    }
    .mapwrap {
      order: -1;
      height: 45vh;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    aside {
      border-right: 0;
      overflow: visible;
      min-height: 55vh;
    }
  }
</style>
