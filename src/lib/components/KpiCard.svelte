<script lang="ts">
  import { formatCentsCompact } from '$lib/utils';

  let {
    label,
    cents,
    sublabel = '',
    positive = true
  }: {
    label: string;
    cents: number;
    sublabel?: string;
    positive?: boolean;
  } = $props();

  const isNegative = $derived(cents < 0);
  const colorClass = $derived(
    isNegative ? 'text-negative' : positive ? 'text-positive' : 'text-text-primary'
  );
</script>

<div class="card card-hover p-6 flex flex-col gap-3 cursor-default">
  <span class="text-xs font-medium text-text-muted uppercase tracking-widest">{label}</span>

  <span class="text-4xl font-bold tracking-tight {colorClass}">
    {formatCentsCompact(cents)}
  </span>

  {#if sublabel}
    <span class="text-xs text-text-muted">{sublabel}</span>
  {/if}
</div>
