<script lang="ts">
  import { onMount } from 'svelte';
  import type { FeeBreakdown } from '$lib/server/profit';
  import { formatCents } from '$lib/utils';

  let { data }: { data: FeeBreakdown[] } = $props();

  let canvas: HTMLCanvasElement;

  onMount(async () => {
    const { Chart, BarElement, LinearScale, CategoryScale, Tooltip } = await import('chart.js');
    Chart.register(BarElement, LinearScale, CategoryScale, Tooltip);

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c0392b';

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.type.replace(/_/g, ' ')),
        datasets: [
          {
            data: data.map((d) => d.totalCents / 100),
            backgroundColor: `${accent}99`,
            borderColor: accent,
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#18181b',
            borderColor: '#27272a',
            borderWidth: 1,
            padding: 10,
            titleColor: '#a1a1aa',
            bodyColor: '#fafafa',
            callbacks: {
              label: (ctx) => ` ${formatCents(Math.round((ctx.raw as number) * 100))}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#52525b', font: { size: 11 } },
            border: { display: false }
          },
          y: {
            grid: { color: '#27272a' },
            ticks: {
              color: '#52525b',
              font: { size: 11 },
              callback: (v) => `$${Number(v).toFixed(0)}`
            },
            border: { display: false }
          }
        }
      }
    });

    return () => chart.destroy();
  });
</script>

<div class="card p-5">
  <p class="text-xs font-medium text-text-muted uppercase tracking-widest mb-4">Fees by type</p>

  {#if data.length === 0}
    <div class="h-44 flex items-center justify-center text-sm text-text-muted">No fee data for this period</div>
  {:else}
    <div class="h-44">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
</div>
