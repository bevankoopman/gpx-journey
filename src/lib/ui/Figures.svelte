<script lang="ts">
  import type { ActivityType } from '../analysis/activityType';
  import type { ActivitySummary } from '../analysis/analyseActivity';
  import {
    duration,
    km,
    pace,
    speed,
    spokenDuration,
    spokenKm,
    spokenPace,
    spokenSpeed,
    startTime,
  } from './format';
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

<!-- A description list: each figure's label is announced with its value, in words. Shown value-first. -->
<dl class="figs">
  <div class="fig hero">
    <dt class="k">Distance</dt>
    <dd class="v">
      <span aria-hidden="true">{km(summary.distanceM)} km</span><span class="sr-only"
        >{spokenKm(summary.distanceM)}</span
      >
    </dd>
  </div>
  {#if summary.timed && summary.movingS !== null && summary.elapsedS !== null}
    <div class="fig">
      {#if summary.activityType === 'running'}
        <dt class="k">Avg pace</dt>
        <dd class="v">
          <span aria-hidden="true"
            >{pace(summary.distanceM, summary.movingS)}<span class="unit">&nbsp;/km</span></span
          >
          <span class="sr-only">{spokenPace(summary.distanceM, summary.movingS)}</span>
        </dd>
      {:else}
        <dt class="k">Avg speed</dt>
        <dd class="v">
          <span aria-hidden="true"
            >{speed(summary.distanceM, summary.movingS)}<span class="unit">&nbsp;km/h</span></span
          >
          <span class="sr-only">{spokenSpeed(summary.distanceM, summary.movingS)}</span>
        </dd>
      {/if}
    </div>
    <div class="fig">
      <dt class="k">Moving time</dt>
      <dd class="v">
        <span aria-hidden="true">{duration(summary.movingS)}</span><span class="sr-only"
          >{spokenDuration(summary.movingS)}</span
        >
      </dd>
    </div>
    <div class="fig">
      <dt class="k">Elapsed time</dt>
      <dd class="v">
        <span aria-hidden="true">{duration(summary.elapsedS)}</span><span class="sr-only"
          >{spokenDuration(summary.elapsedS)}</span
        >
      </dd>
    </div>
  {/if}
  {#if summary.elevationGainM !== null}
    <div class="fig">
      <dt class="k">Elevation gain</dt>
      <dd class="v">
        <span aria-hidden="true">{summary.elevationGainM} m</span><span class="sr-only"
          >{summary.elevationGainM} metres</span
        >
      </dd>
    </div>
  {/if}
</dl>

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
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .fig {
    /* Label first in the markup (for screen readers), value first on screen. */
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
    background: var(--bg);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .fig.hero {
    grid-column: span 2;
  }
  .v {
    margin: 0;
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
