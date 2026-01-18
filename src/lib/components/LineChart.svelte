<script lang="ts">
  import { onMount } from 'svelte';
  import type { DayBucket } from '$lib/server/profit';
  import { formatCents, formatDateShort } from '$lib/utils';

  let { data }: { data: DayBucket[] } = $props();

  let canvas: HTMLCanvasElement;

  onMount(async () => {
    const { Chart, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler } =
      await import('chart.js');

    Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c0392b';

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map((d) => formatDateShort(d.date)),
        datasets: [
          {
            label: 'Gross',
            data: data.map((d) => d.grossCents / 100),
            borderColor: accent,
            backgroundColor: `${accent}18`,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3,
            fill: true
          },
          {
            label: 'Net',
            data: data.map((d) => d.netCents / 100),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.06)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
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
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${formatCents(Math.round((ctx.raw as number) * 100))}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#27272a' },
            ticks: { color: '#52525b', maxTicksLimit: 8, font: { size: 11 } },
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
  <p class="text-xs font-medium text-text-muted uppercase tracking-widest mb-4">Revenue over time</p>

  {#if data.length === 0}
    <div class="h-52 flex items-center justify-center text-sm text-text-muted">No data for this period</div>
  {:else}
    <div class="h-52">
      <canvas bind:this={canvas}></canvas>
    </div>
    <div class="flex items-center gap-5 mt-3">
      <span class="flex items-center gap-1.5 text-xs text-text-secondary">
        <span class="w-3 h-0.5 rounded accent-bg inline-block"></span>Gross
      </span>
      <span class="flex items-center gap-1.5 text-xs text-text-secondary">
        <span class="w-3 h-0.5 rounded bg-positive inline-block"></span>Net
      </span>
    </div>
  {/if}
</div>
