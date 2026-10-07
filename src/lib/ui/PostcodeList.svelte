<script lang="ts">
  import type { PostcodeResult } from '../analysis/postcodes';
  import { POSTCODE_MIN_M } from '../analysis/settings';
  import { POSTCODE_CAVEAT } from '../credits';
  import { km } from './format';

  let { result }: { result: PostcodeResult | null } = $props();

  const longest = $derived(Math.max(1, ...(result?.passed.map((p) => p.distanceM) ?? [])));
</script>

{#if !result}
  <p class="empty">Postcode data couldn’t be loaded, so postcodes aren’t shown.</p>
{:else if result.overlapsAustralia}
  <section>
    <h2>Postcodes passed through · {result.passed.length}</h2>
    {#if result.passed.length === 0}
      <p class="empty">
        No Australian postcodes on this route{#if result.outsideM >= POSTCODE_MIN_M}
          — {km(result.outsideM)} km was outside any postcode (water){/if}.
      </p>
    {:else}
      <ol>
        {#each result.passed as p, i (p.code)}
          <li>
            <span class="n">{i + 1}</span>
            <div>
              <span class="code">{p.code}</span>
              <span class="loc">{p.localities.join(', ')}</span>
              <div class="bar" style:width="{(p.distanceM / longest) * 100}%"></div>
            </div>
            <span class="d">{km(p.distanceM)} km</span>
          </li>
        {/each}
      </ol>
      {#if result.outsideM >= POSTCODE_MIN_M}
        <p class="foot">+ {km(result.outsideM)} km outside any postcode (water)</p>
      {/if}
      <p class="foot">{POSTCODE_CAVEAT}</p>
    {/if}
  </section>
{/if}

<style>
  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 0 0 8px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 22px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 7px 6px;
    border-radius: 8px;
  }
  .n {
    font-size: 11px;
    color: var(--muted);
    text-align: right;
  }
  .code {
    font-weight: 650;
  }
  .loc {
    font-size: 12px;
    color: var(--muted);
  }
  .bar {
    height: 3px;
    background: var(--postcode);
    border-radius: 2px;
    margin-top: 3px;
    opacity: 0.6;
  }
  .d {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .foot {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .empty {
    margin: 0;
    padding: 14px;
    border-radius: 10px;
    background: #f1f1ee;
    color: var(--muted);
    font-size: 14px;
  }
</style>
