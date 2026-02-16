<script lang="ts">
  import { onMount } from 'svelte';
  import type { DayBucket } from '$lib/server/profit';
  import { formatCents, formatDateShort } from '$lib/utils';

  let { data }: { data: DayBucket[] } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let ChartCtor = $state<any>(null);
  let chart: any = null;

  onMount(() => {
    import('chart.js').then(({ Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler }) => {
      Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);
      ChartCtor = Chart;
    });
    return () => { chart?.destroy(); chart = null; };
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
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
          label: (ctx: any) =>
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
          callback: (v: any) => `$${Number(v).toFixed(0)}`
        },
        border: { display: false }
      }
    }
  };

  $effect(() => {
    if (!ChartCtor || !canvas || data.length === 0) return;

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c0392b';
    const labels = data.map((d) => formatDateShort(d.date));
    const gross = data.map((d) => d.grossCents / 100);
    const net = data.map((d) => d.netCents / 100);

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = gross;
      chart.data.datasets[1].data = net;
      chart.update();
    } else {
      chart = new ChartCtor(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Gross',
              data: gross,
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
              data: net,
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
        options: chartOptions
      });
    }
  });
</script>

<div class="card p-5">
  <div class="flex items-center justify-between mb-4">
    <p class="text-xs font-medium text-text-muted uppercase tracking-widest">Revenue over time</p>
    <div class="flex items-center gap-4">
      <span class="flex items-center gap-1.5 text-xs text-text-secondary">
        <span class="w-3 h-0.5 rounded accent-bg inline-block"></span>Gross
      </span>
      <span class="flex items-center gap-1.5 text-xs text-text-secondary">
        <span class="w-3 h-0.5 rounded bg-positive inline-block"></span>Net
      </span>
    </div>
  </div>

  {#if data.length === 0}
    <div class="h-52 flex items-center justify-center text-sm text-text-muted">No data for this period</div>
  {:else}
    <div class="h-52">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
</div>
