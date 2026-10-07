<script lang="ts">
  import type { ActivitySummary } from './lib/analysis/analyseActivity';
  import { analyseInWorker } from './lib/analysis/client';
  import { CREDITS } from './lib/credits';
  import Analysing from './lib/ui/Analysing.svelte';
  import DropZone from './lib/ui/DropZone.svelte';
  import Figures from './lib/ui/Figures.svelte';
  import MapView from './lib/ui/MapView.svelte';

  type View =
    { kind: 'upload'; error?: string } | { kind: 'analysing' } | { kind: 'result'; summary: ActivitySummary };

  // Raw: the summary is replaced wholesale, never mutated, and a long route must not become thousands of proxies.
  let view = $state.raw<View>({ kind: 'upload' });
  let dragging = $state(false);
  // Only the latest file's analysis may land; a slower earlier one is ignored.
  let latest = 0;

  async function handleFile(file: File) {
    const request = ++latest;
    view = { kind: 'analysing' };
    try {
      const summary = await analyseInWorker(await file.text());
      if (request === latest) view = { kind: 'result', summary };
    } catch (err) {
      if (request === latest)
        view = { kind: 'upload', error: err instanceof Error ? err.message : String(err) };
    }
  }

  function newFile() {
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

<div class="layout">
  <aside>
    <header>
      <h1>GPX Journey</h1>
      {#if view.kind === 'result'}<button type="button" onclick={newFile}>New file</button>{/if}
    </header>
    {#if view.kind === 'upload'}
      {#if view.error}<p class="error" role="alert">Couldn't read that file: {view.error}</p>{/if}
      <DropZone onfile={handleFile} {dragging} />
      <p class="muted small">
        Shows the route, distance, time, pace or speed, elevation gain and the Australian postcodes you passed
        through.
      </p>
    {:else if view.kind === 'analysing'}
      <Analysing />
    {:else}
      <Figures summary={view.summary} />
    {/if}
    <footer>{CREDITS}</footer>
  </aside>
  <div class="mapwrap"><MapView route={view.kind === 'result' ? view.summary.route : null} /></div>
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
