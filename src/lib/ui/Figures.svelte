<script lang="ts">
  import type { ActivitySummary } from '../analysis/analyseActivity';

  let { summary }: { summary: ActivitySummary } = $props();
</script>

<div class="figs">
  <div class="fig hero">
    <div class="v">{(summary.distanceM / 1000).toFixed(2)} km</div>
    <div class="k">Distance</div>
  </div>
</div>

<style>
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
    font-size: 30px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .k {
    font-size: 12px;
    color: var(--muted);
  }
</style>
