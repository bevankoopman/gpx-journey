<script lang="ts">
  import type { PostcodeResult } from '../analysis/postcodes';
  import { POSTCODE_MIN_M } from '../analysis/settings';
  import { POSTCODE_CAVEAT } from '../credits';
  import { km, spokenKm } from './format';

  let {
    result,
    highlighted = null,
    onhover = () => {},
    onselect = () => {},
  }: {
    result: PostcodeResult | null;
    /** Postcode highlighted here and on the map. */
    highlighted?: string | null;
    onhover?: (code: string | null) => void;
    onselect?: (code: string) => void;
  } = $props();

  let list: HTMLOListElement | undefined = $state();

  /** Bring a postcode's row into view (when it is picked on the map). */
  export function scrollToPostcode(code: string) {
    const row = list?.querySelector<HTMLElement>(`[data-code="${code}"]`);
    if (!row) return;
    // On phones the pinned map covers the top of the page (the row's scroll-margin-top). Chrome's `nearest`
    // treats a row half under the map as visible, so decide the alignment from the uncovered area ourselves.
    const covered = parseFloat(getComputedStyle(row).scrollMarginTop) || 0;
    if (covered === 0) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const { top, bottom } = row.getBoundingClientRect();
    if (top < covered) row.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else if (bottom > window.innerHeight) row.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

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
      <ol bind:this={list}>
        {#each result.passed as p, i (p.code)}
          <li>
            <!-- Hover or focus highlights the postcode on the map; click (or tap) zooms to it. -->
            <button
              type="button"
              data-code={p.code}
              aria-label={`Postcode ${p.code}${p.localities.length ? `, ${p.localities.join(', ')}` : ''}, ${spokenKm(p.distanceM)}`}
              class:hl={highlighted === p.code}
              onmouseenter={() => onhover(p.code)}
              onmouseleave={() => onhover(null)}
              onfocus={() => onhover(p.code)}
              onblur={() => onhover(null)}
              onclick={() => onselect(p.code)}
            >
              <span class="n">{i + 1}</span>
              <span class="body">
                <span class="code">{p.code}</span>
                <span class="loc">{p.localities.join(', ')}</span>
                <span class="bar" aria-hidden="true" style:width="{(p.distanceM / longest) * 100}%"></span>
              </span>
              <span class="d">{km(p.distanceM)} km</span>
            </button>
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
  button {
    display: grid;
    grid-template-columns: 22px 1fr auto;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 7px 6px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: inherit;
    text-align: left;
  }
  button.hl {
    background: #e7f1fb;
  }
  /* Phone: the map is pinned over the top 45vh, so rows scrolled into view must land below it. */
  @media (max-width: 720px) {
    button {
      scroll-margin-top: calc(45vh + 8px);
    }
  }
  .body {
    display: block;
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
    display: block;
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
