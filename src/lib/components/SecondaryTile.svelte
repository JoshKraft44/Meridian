<script lang="ts">
  import { formatCents } from '$lib/utils';

  let {
    label,
    cents,
    note = ''
  }: {
    label: string;
    cents: number;
    note?: string;
  } = $props();
</script>

<div class="card card-hover p-4 flex flex-col gap-1.5 cursor-default">
  <span class="text-xs text-text-muted uppercase tracking-widest font-medium">{label}</span>
  <span class="text-xl font-semibold text-text-primary">{formatCents(cents)}</span>
  {#if note}
    <span class="text-xs text-warning">{note}</span>
  {/if}
</div>
