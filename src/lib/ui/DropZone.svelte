<script lang="ts">
  let { onfile, dragging = false }: { onfile: (file: File) => void; dragging?: boolean } = $props();

  let input: HTMLInputElement;

  function picked() {
    const file = input.files?.[0];
    if (file) onfile(file);
    input.value = '';
  }
</script>

<div class="drop" class:over={dragging}>
  <b>Drop a GPX file here</b>
  <span class="muted"
    >Run or ride, from Strava, Garmin, Komoot…<br />It stays on your device — nothing is uploaded.</span
  >
  <button type="button" onclick={() => input.click()}>Choose file</button>
  <input bind:this={input} type="file" accept=".gpx,application/gpx+xml" hidden onchange={picked} />
</div>

<style>
  .drop {
    border: 2px dashed #c9c9c4;
    border-radius: 14px;
    padding: 32px 20px;
    text-align: center;
    background: var(--panel);
  }
  .drop.over {
    border-color: var(--accent);
    background: #fff4ec;
  }
  b {
    display: block;
    font-size: 18px;
    margin-bottom: 6px;
  }
  button {
    display: block;
    margin: 14px auto 0;
    border: 0;
    background: var(--ink);
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
  }
</style>
