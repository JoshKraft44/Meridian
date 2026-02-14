<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { DatePreset } from '$lib/types';

  const presets: { label: string; value: DatePreset }[] = [
    { label: 'Today', value: 'today' },
    { label: '7 days', value: 'last7' },
    { label: 'This week', value: 'thisWeek' },
    { label: 'This month', value: 'thisMonth' },
    { label: '30 days', value: 'last30' },
    { label: 'Year to date', value: 'ytd' },
    { label: 'Last 365 days', value: 'lastYear' },
    { label: 'All time', value: 'allTime' }
  ];

  let { current }: { current: DatePreset } = $props();

  let open = $state(false);
  let customStart = $state($page.url.searchParams.get('start') ?? '');
  let customEnd = $state($page.url.searchParams.get('end') ?? '');
  let dropdown = $state<HTMLDivElement>();

  function activeLabel(): string {
    if (current === 'custom') {
      const s = $page.url.searchParams.get('start') ?? '';
      const e = $page.url.searchParams.get('end') ?? '';
      return s && e ? `${s} – ${e}` : 'Custom';
    }
    return presets.find((p) => p.value === current)?.label ?? 'This month';
  }

  function selectPreset(value: DatePreset) {
    const url = new URL($page.url);
    url.searchParams.set('range', value);
    url.searchParams.delete('start');
    url.searchParams.delete('end');
    open = false;
    goto(url.toString(), { keepFocus: true });
  }

  function applyCustom() {
    if (!customStart || !customEnd) return;
    const url = new URL($page.url);
    url.searchParams.set('range', 'custom');
    url.searchParams.set('start', customStart);
    url.searchParams.set('end', customEnd);
    open = false;
    goto(url.toString());
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdown && !dropdown.contains(e.target as Node)) {
      open = false;
    }
  }
</script>

<svelte:document onclick={handleClickOutside} />

<div class="relative" bind:this={dropdown}>
  <button
    onclick={() => (open = !open)}
    class="btn-outline text-xs inline-flex items-center gap-1.5"
  >
    {activeLabel()}
    <svg class="w-3 h-3 text-text-muted" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
    </svg>
  </button>

  {#if open}
    <div class="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-lg bg-elevated border border-border shadow-lg py-1">
      {#each presets as preset}
        <button
          onclick={() => selectPreset(preset.value)}
          class="w-full text-left px-3 py-1.5 text-xs transition-colors duration-100
            {current === preset.value
              ? 'text-white accent-bg'
              : 'text-text-secondary hover:text-text-primary hover:bg-base'}"
        >
          {preset.label}
        </button>
      {/each}

      <div class="border-t border-border mt-1 pt-2 px-3 pb-2 space-y-2">
        <p class="text-[10px] text-text-muted uppercase tracking-wider">Custom range</p>
        <div class="flex items-center gap-1.5">
          <input type="date" bind:value={customStart} class="input text-xs py-1 w-full" />
          <span class="text-text-muted text-xs">–</span>
          <input type="date" bind:value={customEnd} class="input text-xs py-1 w-full" />
        </div>
        <button
          onclick={applyCustom}
          disabled={!customStart || !customEnd}
          class="btn-outline text-xs py-1 w-full"
        >
          Apply
        </button>
      </div>
    </div>
  {/if}
</div>
