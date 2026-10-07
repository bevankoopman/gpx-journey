<script lang="ts">
  import type { ActivityType } from '../analysis/activityType';
  import type { ActivitySummary } from '../analysis/analyseActivity';

  let { summary, onchoose }: { summary: ActivitySummary; onchoose: (type: ActivityType) => void } = $props();

  const OPTIONS: [ActivityType, string][] = [
    ['running', 'Run'],
    ['cycling', 'Ride'],
  ];

  // Where the type came from, as agreed in "UI layout and upload flow".
  const note = $derived.by(() => {
    const { typeSource, typeUncertain, source } = summary;
    if (typeSource === 'file') return { text: `from file: “${source.typeLabel}”`, hint: false };
    if (typeSource === 'speed' && typeUncertain)
      return { text: 'Guessed from speed — tap to change', hint: true };
    if (typeSource === 'default') return { text: 'No type in file — tap to change', hint: true };
    return null;
  });
</script>

<div class="row">
  <!-- Two toggle buttons (aria-pressed): reachable with Tab, activated with Enter or Space. -->
  <div class="seg" role="group" aria-label="Activity type">
    {#each OPTIONS as [type, label] (type)}
      <button
        type="button"
        aria-pressed={summary.activityType === type}
        class:on={summary.activityType === type}
        onclick={() => onchoose(type)}>{label}</button
      >
    {/each}
  </div>
  {#if note}<span class="note" class:hint={note.hint}>{note.text}</span>{/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px;
    background: var(--panel);
  }
  button {
    border: 0;
    background: none;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 13px;
  }
  button.on {
    background: var(--ink);
    color: #fff;
  }
  .note {
    font-size: 12px;
    color: var(--muted);
  }
  .note.hint {
    color: var(--accent-text);
  }
</style>
