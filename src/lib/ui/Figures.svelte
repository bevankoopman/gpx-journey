<script lang="ts">
  import type { ActivityType } from '../analysis/activityType';
  import type { ActivitySummary } from '../analysis/analyseActivity';
  import { duration, km, pace, speed, startTime } from './format';
  import TypeToggle from './TypeToggle.svelte';

  let { summary, onchoosetype }: { summary: ActivitySummary; onchoosetype: (type: ActivityType) => void } =
    $props();

  const title = $derived(
    summary.startTime !== null && summary.timeZone !== null
      ? startTime(summary.startTime, summary.timeZone)
      : 'Untimed route',
  );
</script>

<div class="head">
  <h2 class="title">{title}</h2>
  <TypeToggle {summary} onchoose={onchoosetype} />
</div>

<div class="figs">
  <div class="fig hero">
    <div class="v">{km(summary.distanceM)} km</div>
    <div class="k">Distance</div>
  </div>
  {#if summary.timed && summary.movingS !== null && summary.elapsedS !== null}
    <div class="fig">
      {#if summary.activityType === 'running'}
        <div class="v">{pace(summary.distanceM, summary.movingS)}<span class="unit">&nbsp;/km</span></div>
        <div class="k">Avg pace</div>
      {:else}
        <div class="v">{speed(summary.distanceM, summary.movingS)}<span class="unit">&nbsp;km/h</span></div>
        <div class="k">Avg speed</div>
      {/if}
    </div>
    <div class="fig">
      <div class="v">{duration(summary.movingS)}</div>
      <div class="k">Moving time</div>
    </div>
    <div class="fig">
      <div class="v">{duration(summary.elapsedS)}</div>
      <div class="k">Elapsed time</div>
    </div>
  {/if}
  {#if summary.elevationGainM !== null}
    <div class="fig">
      <div class="v">{summary.elevationGainM} m</div>
      <div class="k">Elevation gain</div>
    </div>
  {/if}
</div>

{#if !summary.timed}
  <p class="note">This file has no timestamps, so time and pace aren’t available.</p>
{/if}

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .title {
    font-size: 20px;
    font-weight: 650;
    margin: 0;
  }
  .figs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .fig {
    background: var(--bg);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .fig.hero {
    grid-column: span 2;
  }
  .v {
    font-size: 22px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .hero .v {
    font-size: 30px;
  }
  .unit {
    font-size: 12px;
  }
  .k {
    font-size: 12px;
    color: var(--muted);
  }
  .note {
    margin: 0;
    padding: 14px;
    border-radius: 10px;
    background: #f1f1ee;
    color: var(--muted);
    font-size: 14px;
  }
</style>
