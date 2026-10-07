<script lang="ts">
  import { CREDITS } from './lib/credits';
  import DropZone from './lib/ui/DropZone.svelte';
  import MapView from './lib/ui/MapView.svelte';

  let dragging = $state(false);

  // Analysis arrives with "Upload → route on the map + distance"; for now a chosen file is ignored.
  function handleFile(_file: File) {}

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
    if (file) handleFile(file);
  }
</script>

<svelte:window {ondragover} {ondragleave} {ondrop} />

<div class="layout">
  <aside>
    <header><h1>GPX Journey</h1></header>
    <DropZone onfile={handleFile} {dragging} />
    <p class="muted small">
      Shows the route, distance, time, pace or speed, elevation gain and the Australian postcodes you passed
      through.
    </p>
    <footer>{CREDITS}</footer>
  </aside>
  <div class="mapwrap"><MapView /></div>
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
  header h1 {
    font-size: 17px;
    margin: 0;
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
