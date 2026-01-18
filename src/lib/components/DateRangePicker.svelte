<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { DatePreset } from '$lib/types';

  const presets: { label: string; value: DatePreset }[] = [
    { label: 'This week', value: 'thisWeek' },
    { label: 'This month', value: 'thisMonth' },
    { label: 'Last 30 days', value: 'last30' },
    { label: 'Custom', value: 'custom' }
  ];

  let { current }: { current: DatePreset } = $props();

  let customStart = $state($page.url.searchParams.get('start') ?? '');
  let customEnd = $state($page.url.searchParams.get('end') ?? '');

  function selectPreset(value: DatePreset) {
    if (value === 'custom') return;
    const url = new URL($page.url);
    url.searchParams.set('range', value);
    url.searchParams.delete('start');
    url.searchParams.delete('end');
    goto(url.toString(), { keepFocus: true });
  }

  function applyCustom() {
    if (!customStart || !customEnd) return;
    const url = new URL($page.url);
    url.searchParams.set('range', 'custom');
    url.searchParams.set('start', customStart);
    url.searchParams.set('end', customEnd);
    goto(url.toString());
  }
</script>

<div class="flex items-center gap-2 flex-wrap">
  {#each presets as preset}
    {#if preset.value !== 'custom'}
      <button
        onclick={() => selectPreset(preset.value)}
        class="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
          {current === preset.value
            ? 'text-white accent-bg'
            : 'text-text-secondary bg-elevated border border-border hover:border-border-hover hover:text-text-primary'}"
      >
        {preset.label}
      </button>
    {/if}
  {/each}

  <div class="flex items-center gap-1.5">
    <input
      type="date"
      bind:value={customStart}
      class="input text-xs py-1.5 w-36"
    />
    <span class="text-text-muted text-xs">–</span>
    <input
      type="date"
      bind:value={customEnd}
      class="input text-xs py-1.5 w-36"
    />
    <button
      onclick={applyCustom}
      disabled={!customStart || !customEnd}
      class="btn-outline text-xs py-1.5 px-3"
    >
      Apply
    </button>
  </div>
</div>
